"use client"

import { useEffect, useRef, useState } from "react"

export type LocationPayload = {
  lat: number
  lng: number
  address: string
  city: string
  state: string
  pincode: string
  country: string
  placeId?: string
  name?: string
}

type MapLocationPickerProps = {
  apiKey?: string
  initialLat?: number
  initialLng?: number
  onChange: (payload: LocationPayload) => void
}

let googleScriptPromise: Promise<void> | null = null

function loadGoogleMapsScript(apiKey: string) {
  if (typeof window === "undefined") return Promise.resolve()
  if ((window as any).google?.maps) return Promise.resolve()
  if (googleScriptPromise) return googleScriptPromise

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const win = window as any
    win.__hashGoogleAuthFailed = false
    const previousAuthFailure = win.gm_authFailure
    win.gm_authFailure = () => {
      win.__hashGoogleAuthFailed = true
      if (typeof previousAuthFailure === "function") {
        previousAuthFailure()
      }
      reject(
        new Error(
          "Google Maps authorization failed. Check API key, billing, and allowed referrers (include onboard.hashforgamers.com/*)."
        )
      )
    }

    const script = document.createElement("script")
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`
    script.async = true
    script.defer = true
    script.onload = () => {
      if (win.__hashGoogleAuthFailed) {
        reject(
          new Error(
            "Google Maps rejected this API key. Ensure Maps JavaScript API + Places API are enabled and domain referrer is allowed."
          )
        )
        return
      }
      resolve()
    }
    script.onerror = () => reject(new Error("Failed to load Google Maps script. Check network/CSP settings."))
    document.head.appendChild(script)
  })

  return googleScriptPromise
}

function pickComponent(components: any[] = [], type: string) {
  return components.find((component) => component.types?.includes(type))?.long_name || ""
}

function pickFirstComponent(components: any[] = [], types: string[]) {
  for (const type of types) {
    const value = pickComponent(components, type)
    if (value) return value
  }
  return ""
}

function extractLocationPayload(result: any): LocationPayload {
  const components = result?.address_components || []
  const streetNumber = pickComponent(components, "street_number")
  const route = pickComponent(components, "route")
  const neighborhood =
    pickFirstComponent(components, ["sublocality_level_1", "sublocality", "neighborhood"]) || ""
  const composedAddress = [streetNumber, route, neighborhood].filter(Boolean).join(" ").trim()
  const address = composedAddress || result?.formatted_address || result?.name || ""

  const city = pickFirstComponent(components, [
    "locality",
    "sublocality_level_1",
    "sublocality",
    "administrative_area_level_3",
    "administrative_area_level_2"
  ])

  return {
    lat: Number(result?.geometry?.location?.lat?.() ?? result?.geometry?.location?.lat ?? 0),
    lng: Number(result?.geometry?.location?.lng?.() ?? result?.geometry?.location?.lng ?? 0),
    address,
    city,
    state: pickComponent(components, "administrative_area_level_1"),
    pincode: pickComponent(components, "postal_code"),
    country: pickComponent(components, "country") || "India",
    placeId: result?.place_id,
    name: result?.name
  }
}

export default function MapLocationPicker({
  apiKey,
  initialLat,
  initialLng,
  onChange
}: MapLocationPickerProps) {
  const initialLatRef = useRef(initialLat)
  const initialLngRef = useRef(initialLng)
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const geocoderRef = useRef<any>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const autocompleteRef = useRef<any>(null)
  const [searchText, setSearchText] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    if (!apiKey) {
      setStatus("error")
      setErrorMessage("Google map key missing (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).")
      return
    }

    let mounted = true

    const initMap = async () => {
      try {
        setStatus("loading")
        await loadGoogleMapsScript(apiKey)
        if (!mounted) return

        const google = (window as any).google
        const center = {
          lat: Number.isFinite(initialLatRef.current) ? Number(initialLatRef.current) : 20.5937,
          lng: Number.isFinite(initialLngRef.current) ? Number(initialLngRef.current) : 78.9629
        }

        if (!mapElRef.current) return

        mapRef.current = new google.maps.Map(mapElRef.current, {
          center,
          zoom: Number.isFinite(initialLatRef.current) ? 16 : 5,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false
        })

        // Wait for first tile load. If Google auth/billing/referrer is broken,
        // maps often stay on a gray error canvas and never become interactive.
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            reject(
              new Error(
                "Google map failed to initialize. Verify Google Cloud billing, Maps JS + Places APIs, and allowed referrers."
              )
            )
          }, 7000)

          google.maps.event.addListenerOnce(mapRef.current, "tilesloaded", () => {
            window.clearTimeout(timeout)
            resolve()
          })
        })

        geocoderRef.current = new google.maps.Geocoder()
        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          position: center,
          draggable: true,
          title: "Drag marker to set exact cafe location"
        })

        const reverseGeocode = (position: any) => {
          if (!geocoderRef.current) return
          geocoderRef.current.geocode({ location: position }, (results: any, geoStatus: string) => {
            if (geoStatus !== "OK" || !results?.length) {
              onChange({
                lat: position.lat(),
                lng: position.lng(),
                address: "",
                city: "",
                state: "",
                pincode: "",
                country: "India"
              })
              return
            }

            const bestResult =
              results.find((entry: any) => pickComponent(entry?.address_components || [], "postal_code")) || results[0]
            const payload = extractLocationPayload({
              ...bestResult,
              geometry: { location: position }
            })
            onChange(payload)
          })
        }

        markerRef.current.addListener("dragend", (event: any) => {
          if (!event?.latLng) return
          reverseGeocode(event.latLng)
        })

        mapRef.current.addListener("click", (event: any) => {
          if (!event?.latLng || !markerRef.current) return
          markerRef.current.setPosition(event.latLng)
          reverseGeocode(event.latLng)
        })

        if (searchInputRef.current) {
          autocompleteRef.current = new google.maps.places.Autocomplete(searchInputRef.current, {
            fields: ["formatted_address", "address_components", "geometry", "name", "place_id"],
            types: ["establishment", "geocode"],
            componentRestrictions: { country: "in" }
          })

          autocompleteRef.current.addListener("place_changed", () => {
            const place = autocompleteRef.current?.getPlace?.()
            if (!place?.geometry?.location || !mapRef.current || !markerRef.current) return

            mapRef.current.setCenter(place.geometry.location)
            mapRef.current.setZoom(16)
            markerRef.current.setPosition(place.geometry.location)

            const updateWithPayload = (payload: LocationPayload) => {
              setSearchText(place?.name || place?.formatted_address || payload.address || "")
              onChange(payload)
            }

            if (place?.place_id && geocoderRef.current) {
              geocoderRef.current.geocode({ placeId: place.place_id }, (results: any, geoStatus: string) => {
                if (geoStatus === "OK" && results?.length) {
                  const bestResult =
                    results.find((entry: any) => pickComponent(entry?.address_components || [], "postal_code")) ||
                    results[0]
                  updateWithPayload(
                    extractLocationPayload({
                      ...bestResult,
                      geometry: { location: place.geometry.location },
                      place_id: place.place_id,
                      name: place?.name
                    })
                  )
                  return
                }
                updateWithPayload(extractLocationPayload(place))
              })
              return
            }

            updateWithPayload(extractLocationPayload(place))
          })
        }

        setStatus("ready")
      } catch (error) {
        if (!mounted) return
        setStatus("error")
        setErrorMessage(error instanceof Error ? error.message : "Map failed to load")
        mapRef.current = null
        markerRef.current = null
      }
    }

    initMap()

    return () => {
      mounted = false
    }
  }, [apiKey, onChange])

  return (
    <div className="map-card">
      <div className="map-toolbar">
        <input
          ref={searchInputRef}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="input"
          placeholder="Search cafe on map (Google Places)"
        />
      </div>
      <div ref={mapElRef} className="map-canvas" />
      {status === "loading" && <p className="helper">Loading map...</p>}
      {status === "ready" && (
        <p className="helper">Tip: Click map or drag marker to set exact location.</p>
      )}
      {status === "error" && <p className="map-error">{errorMessage}</p>}
    </div>
  )
}
