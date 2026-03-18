const cleanText = (value: unknown, max = 160) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export const CHECKOUT_LIMITS = {
  customer: {
    fullName: 80,
    email: 120,
    phone: 13
  },
  shippingAddress: {
    city: 80,
    postalCode: 8,
    street: 80,
    streetNumber: 10,
    apartment: 20,
    notes: 180
  }
} as const;

const normalizeForCompare = (value: unknown) =>
  cleanText(value, 160)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const normalizePostalCode = (value: unknown) =>
  cleanText(value, CHECKOUT_LIMITS.shippingAddress.postalCode)
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

const digitsOnly = (value: unknown) => cleanText(value, 40).replace(/\D+/g, "");
const normalizeWordField = (value: unknown, max: number) =>
  cleanText(value, max).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9' .-]/g, "");
const normalizeName = (value: unknown) =>
  cleanText(value, CHECKOUT_LIMITS.customer.fullName).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]/g, "");
const normalizeStreet = (value: unknown) =>
  cleanText(value, CHECKOUT_LIMITS.shippingAddress.street).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9' ./-]/g, "");
const normalizeStreetNumber = (value: unknown) =>
  cleanText(value, CHECKOUT_LIMITS.shippingAddress.streetNumber).replace(/[^A-Za-z0-9/-]/g, "");
const normalizeApartment = (value: unknown) =>
  cleanText(value, CHECKOUT_LIMITS.shippingAddress.apartment).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ./-]/g, "");
const normalizeNotes = (value: unknown) =>
  cleanText(value, CHECKOUT_LIMITS.shippingAddress.notes);
const normalizeEmail = (value: unknown) =>
  cleanText(value, CHECKOUT_LIMITS.customer.email).replace(/\s+/g, "").toLowerCase();
const normalizePhone = (value: unknown) =>
  digitsOnly(value).slice(0, CHECKOUT_LIMITS.customer.phone);

export const ARGENTINA_PROVINCES = [
  "Ciudad Autonoma de Buenos Aires",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Cordoba",
  "Corrientes",
  "Entre Rios",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquen",
  "Rio Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucuman"
] as const;

export const FREE_SHIPPING_THRESHOLD = 129000;

const SHIPPING_RULES = {
  caba: 4000,
  amba: 6500,
  buenosAires: 9000,
  national: 18000
} as const;

export type CheckoutDetails = {
  customer: {
    fullName: string;
    email: string;
    phone: string;
  };
  shippingAddress: {
    province: string;
    city: string;
    postalCode: string;
    street: string;
    streetNumber: string;
    apartment: string;
    notes: string;
  };
};

export type ShippingQuote = {
  amount: number;
  currency: "ARS";
  zone: "free" | "caba" | "amba" | "buenos-aires" | "national";
  label: string;
  description: string;
  isFree: boolean;
  threshold: number;
};

const resolveProvince = (value: unknown) => {
  const normalized = normalizeForCompare(value);
  const matched = ARGENTINA_PROVINCES.find((province) => normalizeForCompare(province) === normalized);
  return matched || "";
};

const extractPostalNumericPrefix = (postalCode: string) => {
  const match = postalCode.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidFullName = (value: string) =>
  /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[ '.-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)+$/.test(value);
const isValidArgentinaPhone = (value: string) => {
  const digits = digitsOnly(value);
  if (!digits) return false;
  if (digits.startsWith("54")) {
    return digits.length === 12 || digits.length === 13;
  }
  return digits.length === 10 || digits.length === 11;
};
const isValidPostalCode = (value: string) => /^(?:\d{4}|[A-Z]\d{4}[A-Z]{3})$/.test(value);
const isValidCity = (value: string) =>
  /^(?=.{2,80}$)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+(?:[ '.-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+)*$/.test(value);
const isValidStreet = (value: string) =>
  /^(?=.{3,80}$)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+(?:[ '.\/-][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9]+)*$/.test(value);
const isValidStreetNumber = (value: string) =>
  /^(?=.{1,10}$)[A-Za-z0-9/-]+$/.test(value);
const isValidApartment = (value: string) =>
  !value || /^(?=.{1,20}$)[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ./-]+$/.test(value);

const isCabaPostalCode = (postalCode: string) => {
  if (!postalCode) return false;
  if (postalCode.startsWith("C")) return true;
  const numeric = extractPostalNumericPrefix(postalCode);
  return numeric !== null && numeric >= 1000 && numeric <= 1499;
};

const isAmbaPostalCode = (postalCode: string) => {
  const numeric = extractPostalNumericPrefix(postalCode);
  return numeric !== null && numeric >= 1600 && numeric <= 1899;
};

export const normalizeCheckoutDetails = (value: unknown): CheckoutDetails => {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
  const customer = input.customer && typeof input.customer === "object" && !Array.isArray(input.customer)
    ? input.customer as Record<string, any>
    : {};
  const shippingAddress = input.shippingAddress && typeof input.shippingAddress === "object" && !Array.isArray(input.shippingAddress)
    ? input.shippingAddress as Record<string, any>
    : {};

  return {
    customer: {
      fullName: normalizeName(customer.fullName),
      email: normalizeEmail(customer.email),
      phone: normalizePhone(customer.phone)
    },
    shippingAddress: {
      province: resolveProvince(shippingAddress.province),
      city: normalizeWordField(shippingAddress.city, CHECKOUT_LIMITS.shippingAddress.city),
      postalCode: normalizePostalCode(shippingAddress.postalCode),
      street: normalizeStreet(shippingAddress.street),
      streetNumber: normalizeStreetNumber(shippingAddress.streetNumber),
      apartment: normalizeApartment(shippingAddress.apartment),
      notes: normalizeNotes(shippingAddress.notes)
    }
  };
};

export const getCheckoutIssues = (
  details: CheckoutDetails,
  { requireComplete = false }: { requireComplete?: boolean } = {}
) => {
  const issues: string[] = [];
  const { customer, shippingAddress } = details;

  if (requireComplete || customer.fullName) {
    if (!isValidFullName(customer.fullName)) issues.push("Ingresa nombre y apellido reales.");
  }
  if (requireComplete || customer.email) {
    if (!isValidEmail(customer.email)) issues.push("Ingresa un email valido.");
  }
  if (requireComplete || customer.phone) {
    if (!isValidArgentinaPhone(customer.phone)) issues.push("Ingresa un telefono valido de Argentina.");
  }
  if (requireComplete || shippingAddress.province) {
    if (!shippingAddress.province) issues.push("Selecciona una provincia.");
  }
  if (requireComplete || shippingAddress.city) {
    if (!isValidCity(shippingAddress.city)) issues.push("Ingresa una ciudad valida.");
  }
  if (requireComplete || shippingAddress.postalCode) {
    if (!isValidPostalCode(shippingAddress.postalCode)) issues.push("Ingresa un codigo postal argentino valido.");
  }
  if (requireComplete || shippingAddress.street) {
    if (!isValidStreet(shippingAddress.street)) issues.push("Ingresa una calle valida.");
  }
  if (requireComplete || shippingAddress.streetNumber) {
    if (!isValidStreetNumber(shippingAddress.streetNumber)) issues.push("Ingresa una altura valida.");
  }
  if (requireComplete || shippingAddress.apartment) {
    if (!isValidApartment(shippingAddress.apartment)) issues.push("Revisa el piso o departamento.");
  }

  return Array.from(new Set(issues));
};

export const canQuoteShipping = (details: CheckoutDetails) =>
  Boolean(details.shippingAddress.province && details.shippingAddress.postalCode);

export const calculateShippingQuote = ({
  subtotal,
  shippingAddress
}: {
  subtotal: number;
  shippingAddress: CheckoutDetails["shippingAddress"];
}): ShippingQuote | null => {
  if (!shippingAddress.province || !shippingAddress.postalCode) return null;

  if (subtotal >= FREE_SHIPPING_THRESHOLD) {
    return {
      amount: 0,
      currency: "ARS",
      zone: "free",
      label: "Envio gratis",
      description: `Tu compra supera ARS ${FREE_SHIPPING_THRESHOLD.toLocaleString("es-AR")} y el envio va por cuenta de Fortunato.`,
      isFree: true,
      threshold: FREE_SHIPPING_THRESHOLD
    };
  }

  if (shippingAddress.province === "Ciudad Autonoma de Buenos Aires" || isCabaPostalCode(shippingAddress.postalCode)) {
    return {
      amount: SHIPPING_RULES.caba,
      currency: "ARS",
      zone: "caba",
      label: "Envio en CABA",
      description: "Entrega en Ciudad Autonoma de Buenos Aires.",
      isFree: false,
      threshold: FREE_SHIPPING_THRESHOLD
    };
  }

  if (shippingAddress.province === "Buenos Aires" && isAmbaPostalCode(shippingAddress.postalCode)) {
    return {
      amount: SHIPPING_RULES.amba,
      currency: "ARS",
      zone: "amba",
      label: "Envio en AMBA",
      description: "Entrega estimada para GBA y alrededores.",
      isFree: false,
      threshold: FREE_SHIPPING_THRESHOLD
    };
  }

  if (shippingAddress.province === "Buenos Aires") {
    return {
      amount: SHIPPING_RULES.buenosAires,
      currency: "ARS",
      zone: "buenos-aires",
      label: "Envio en Provincia de Buenos Aires",
      description: "Entrega estimada para Provincia de Buenos Aires.",
      isFree: false,
      threshold: FREE_SHIPPING_THRESHOLD
    };
  }

  return {
    amount: SHIPPING_RULES.national,
    currency: "ARS",
    zone: "national",
    label: "Envio nacional",
    description: "Entrega estimada para el interior del pais.",
    isFree: false,
    threshold: FREE_SHIPPING_THRESHOLD
  };
};

export const splitFullName = (fullName: string) => {
  const normalized = cleanText(fullName, 120);
  const parts = normalized.split(" ").filter(Boolean);
  if (!parts.length) return { name: "", surname: "" };
  if (parts.length === 1) return { name: parts[0], surname: "" };
  return {
    name: parts.slice(0, -1).join(" "),
    surname: parts.slice(-1).join(" ")
  };
};
