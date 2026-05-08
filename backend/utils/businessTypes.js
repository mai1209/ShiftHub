export const DEFAULT_BUSINESS_TYPE = "other";

export const BUSINESS_TYPE_OPTIONS = [
  { value: "beauty_center", label: "Centro de estetica" },
  { value: "hair_salon", label: "Peluqueria" },
  { value: "nails", label: "Unas" },
  { value: "spa", label: "Spa y masajes" },
  { value: "medical", label: "Consultorio medico" },
  { value: "dentistry", label: "Odontologia" },
  { value: "kinesiology", label: "Kinesiologia" },
  { value: "psychology", label: "Psicologia y terapia" },
  { value: "veterinary", label: "Veterinaria" },
  { value: "tattoo", label: "Estudio de tatuajes" },
  { value: "fitness", label: "Fitness y entrenamiento" },
  { value: "other", label: "Otro rubro" },
];

export const BUSINESS_TYPE_VALUES = BUSINESS_TYPE_OPTIONS.map((option) => option.value);

export function isValidBusinessType(value) {
  return BUSINESS_TYPE_VALUES.includes(String(value ?? "").trim().toLowerCase());
}

export function normalizeBusinessType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isValidBusinessType(normalized) ? normalized : DEFAULT_BUSINESS_TYPE;
}

export function getBusinessTypeLabel(value) {
  const normalized = normalizeBusinessType(value);
  return (
    BUSINESS_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ||
    BUSINESS_TYPE_OPTIONS.find((option) => option.value === DEFAULT_BUSINESS_TYPE)?.label ||
    "Otro rubro"
  );
}
