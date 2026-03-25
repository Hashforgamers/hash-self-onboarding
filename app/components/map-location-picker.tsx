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
  autoSearchText?: string
  autoSearchContext?: string
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

function extractLocationPayload(result: any): LocationPayload {
  const components = result?.address_components || []
  const streetNumber = pickComponent(components, "street_number")
  const route = pickComponent(components, "route")
  const neighborhood = pickComponent(components, "sublocality") || pickComponent(components, "neighborhood")
  const address = [streetNumber, route, neighborhood].filter(Boolean).join(" ") || result?.formatted_address || ""

  const city =
    pickComponent(components, "locality") ||
    pickComponent(components, "administrative_area_level_2") ||
    pickComponent(components, "sublocality")

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
  autoSearchText,
  autoSearchContext,
  onChange
}: MapLocationPickerProps) {
  const initialLatRef = useRef(initialLat)
  const initialLngRef = useRef(initialLng)
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const inputElRef = useRef<HTMLInputElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const geocoderRef = useRef<any>(null)
  const placesServiceRef = useRef<any>(null)
  const autoSearchTimerRef = useRef<number | null>(null)
  const lastAutoQueryRef = useRef("")
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    if (!apiKey) {
      setStatus("error")
      setErrorMessage("Google map key missing (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY).")
      return
    }

    let mounted = true

    const applyPlace = (place: any) => {
      if (!place?.geometry?.location || !mapRef.current || !markerRef.current) return

      mapRef.current.setCenter(place.geometry.location)
      mapRef.current.setZoom(17)
      markerRef.current.setPosition(place.geometry.location)

      if (!geocoderRef.current || !place.place_id) {
        const payload = extractLocationPayload(place)
        onChange(payload)
        return
      }

      geocoderRef.current.geocode({ placeId: place.place_id }, (results: any, geoStatus: string) => {
        if (geoStatus === "OK" && results?.length) {
          const enriched = {
            ...results[0],
            place_id: place.place_id,
            name: place.name || results[0]?.name,
            geometry: { location: place.geometry.location }
          }
          onChange(extractLocationPayload(enriched))
          return
        }
        onChange(extractLocationPayload(place))
      })
    }

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
        placesServiceRef.current = new google.maps.places.PlacesService(mapRef.current)

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

            const payload = extractLocationPayload({
              ...results[0],
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

        if (inputElRef.current) {
          const autocomplete = new google.maps.places.Autocomplete(inputElRef.current, {
            fields: ["place_id", "name", "formatted_address", "address_components", "geometry"],
            types: ["establishment"],
            componentRestrictions: { country: "in" }
          })
          autocomplete.addListener("place_changed", () => {
            const place = autocomplete.getPlace()
            applyPlace(place)
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
      if (autoSearchTimerRef.current) {
        window.clearTimeout(autoSearchTimerRef.current)
        autoSearchTimerRef.current = null
      }
    }
  }, [apiKey, onChange])

  useEffect(() => {
    if (status !== "ready") return

    const raw = String(autoSearchText || "").trim()
    if (inputElRef.current && inputElRef.current.value !== raw) {
      inputElRef.current.value = raw
      inputElRef.current.dispatchEvent(new Event("input", { bubbles: true }))
    }

    if (raw.length < 3 || !placesServiceRef.current) return

    const contextualQuery = [raw, String(autoSearchContext || "").trim(), "gaming cafe India"]
      .filter(Boolean)
      .join(" ")
      .trim()
      .replace(/\s+/g, " ")

    if (!contextualQuery || contextualQuery === lastAutoQueryRef.current) return

    if (autoSearchTimerRef.current) {
      window.clearTimeout(autoSearchTimerRef.current)
    }

    autoSearchTimerRef.current = window.setTimeout(() => {
      if (!placesServiceRef.current) return
      placesServiceRef.current.findPlaceFromQuery(
        {
          query: contextualQuery,
          fields: ["place_id", "name", "formatted_address", "geometry"]
        },
        (results: any[], findStatus: string) => {
          if (findStatus !== "OK" || !results?.length) return
          const first = results[0]
          if (!first?.geometry?.location) return
          lastAutoQueryRef.current = contextualQuery

          if (!mapRef.current || !markerRef.current) return
          mapRef.current.setCenter(first.geometry.location)
          mapRef.current.setZoom(17)
          markerRef.current.setPosition(first.geometry.location)

          if (!geocoderRef.current || !first.place_id) {
            onChange(extractLocationPayload(first))
            return
          }

          geocoderRef.current.geocode({ placeId: first.place_id }, (geoResults: any, geoStatus: string) => {
            if (geoStatus === "OK" && geoResults?.length) {
              const enriched = {
                ...geoResults[0],
                place_id: first.place_id,
                name: first.name || geoResults[0]?.name,
                geometry: { location: first.geometry.location }
              }
              onChange(extractLocationPayload(enriched))
              return
            }
            onChange(extractLocationPayload(first))
          })
        }
      )
    }, 650)

    return () => {
      if (autoSearchTimerRef.current) {
        window.clearTimeout(autoSearchTimerRef.current)
        autoSearchTimerRef.current = null
      }
    }
  }, [autoSearchText, autoSearchContext, status, onChange])

  return (
    <div className="map-card">
      <div className="map-toolbar">
        <input
          ref={inputElRef}
          className="input"
          placeholder="Search cafe on map (Google Places)"
          type="text"
        />
      </div>
      <div ref={mapElRef} className="map-canvas" />
      {status === "loading" && <p className="helper">Loading map...</p>}
      {status === "ready" && (
        <p className="helper">Tip: Search a place, click map, or drag marker to set exact location.</p>
      )}
      {status === "error" && <p className="map-error">{errorMessage}</p>}
    </div>
  )
}
