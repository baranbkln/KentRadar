export type BrowserLocation = {
  accuracyMeters: number | null;
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

export function getCurrentPosition(): Promise<BrowserLocation> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("geolocation_unsupported"));
  }

  if (window.isSecureContext === false) {
    return Promise.reject(new Error("geolocation_insecure_context"));
  }

  return new Promise((resolve, reject) => {
    let didSettle = false;

    function resolvePosition(position: GeolocationPosition) {
      if (didSettle) {
        return;
      }

      didSettle = true;
      resolve({
        accuracyMeters: Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    }

    function rejectWith(error: GeolocationPositionError) {
      if (didSettle) {
        return;
      }

      if (error.code === error.PERMISSION_DENIED) {
        didSettle = true;
        reject(error);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolvePosition,
        (fallbackError) => {
          if (didSettle) {
            return;
          }

          didSettle = true;
          reject(fallbackError);
        },
        {
          enableHighAccuracy: false,
          maximumAge: 120_000,
          timeout: 15_000,
        },
      );
    }

    navigator.geolocation.getCurrentPosition(resolvePosition, rejectWith, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 10_000,
    });
  });
}

export function calculateDistanceMeters(
  from: Pick<BrowserLocation, "latitude" | "longitude">,
  to: Pick<BrowserLocation, "latitude" | "longitude">,
) {
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinIssueActionRange(
  from: Pick<BrowserLocation, "latitude" | "longitude">,
  to: Pick<BrowserLocation, "latitude" | "longitude">,
  rangeMeters = 150,
) {
  return calculateDistanceMeters(from, to) <= rangeMeters;
}

export function getLocationErrorMessage(error: unknown) {
  if (isGeolocationError(error)) {
    if (error.code === error.PERMISSION_DENIED) {
      return "Konum izni verilmedi.";
    }

    if (error.code === error.POSITION_UNAVAILABLE) {
      return "Konum bilgisi alınamadı.";
    }

    if (error.code === error.TIMEOUT) {
      return "Konum alınırken zaman aşımı oluştu.";
    }

    return "Konum alınamadı.";
  }

  if (error instanceof Error) {
    if (error.message === "geolocation_unsupported") {
      return "Tarayıcı konum özelliğini desteklemiyor.";
    }

    if (error.message === "geolocation_insecure_context") {
      return "Konum için güvenli bağlantı gerekiyor. Lütfen localhost veya HTTPS kullan.";
    }
  }

  return "Konum alınamadı.";
}

function isGeolocationError(
  error: unknown,
): error is GeolocationPositionError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "number"
  );
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
