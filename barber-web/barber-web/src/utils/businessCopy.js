export const SHIFT_APP_BRAND_NAME = 'ShiftHub';

const DEFAULT_BUSINESS_TYPE = 'other';

export const BUSINESS_TYPE_OPTIONS = [
  {
    value: 'beauty_center',
    label: 'Centro de estética',
    description: 'Faciales, depilación, cosmetología y tratamientos.',
  },
  {
    value: 'hair_salon',
    label: 'Peluquería',
    description: 'Cortes, color, brushing y peinados.',
  },
  {
    value: 'nails',
    label: 'Uñas',
    description: 'Manicuría, pedicuría y nail art.',
  },
  {
    value: 'spa',
    label: 'Spa y masajes',
    description: 'Masajes, relax y bienestar.',
  },
  {
    value: 'medical',
    label: 'Consultorio médico',
    description: 'Turnos para medicina general o especialidades.',
  },
  {
    value: 'dentistry',
    label: 'Odontología',
    description: 'Consultas, limpiezas y tratamientos odontológicos.',
  },
  {
    value: 'kinesiology',
    label: 'Kinesiología',
    description: 'Rehabilitación, fisioterapia y sesiones.',
  },
  {
    value: 'psychology',
    label: 'Psicología y terapia',
    description: 'Consultas psicológicas y terapias.',
  },
  {
    value: 'veterinary',
    label: 'Veterinaria',
    description: 'Consultas, controles y atención animal.',
  },
  {
    value: 'tattoo',
    label: 'Estudio de tatuajes',
    description: 'Sesiones, consultas y reservas de tatuaje.',
  },
  {
    value: 'fitness',
    label: 'Fitness y entrenamiento',
    description: 'Clases y entrenamientos personalizados.',
  },
  {
    value: 'other',
    label: 'Otro rubro',
    description: 'Usá términos neutrales para cualquier otro negocio.',
  },
];

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

export function normalizeBusinessType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return BUSINESS_TYPE_OPTIONS.some(option => option.value === normalized)
    ? normalized
    : DEFAULT_BUSINESS_TYPE;
}

export function getBusinessCopy(value) {
  const businessType = normalizeBusinessType(value);
  const businessTypeLabel =
    BUSINESS_TYPE_OPTIONS.find(option => option.value === businessType)?.label ||
    'Otro rubro';

  const base = {
    brandName: SHIFT_APP_BRAND_NAME,
    businessType,
    businessTypeLabel,
    businessLabel: 'negocio',
    yourBusiness: 'tu negocio',
    theBusiness: 'el negocio',
    atBusiness: 'en el local',
    staffSingular: 'profesional',
    staffPlural: 'profesionales',
  };

  const overrides = {
    beauty_center: {
      businessLabel: 'centro',
      yourBusiness: 'tu centro',
      theBusiness: 'el centro',
      atBusiness: 'en el centro',
      staffSingular: 'especialista',
      staffPlural: 'especialistas',
    },
    hair_salon: {
      businessLabel: 'salón',
      yourBusiness: 'tu salón',
      theBusiness: 'el salón',
      atBusiness: 'en el salón',
      staffSingular: 'estilista',
      staffPlural: 'estilistas',
    },
    nails: {
      businessLabel: 'espacio',
      yourBusiness: 'tu espacio',
      theBusiness: 'el espacio',
      atBusiness: 'en el espacio',
      staffSingular: 'especialista',
      staffPlural: 'especialistas',
    },
    spa: {
      businessLabel: 'spa',
      yourBusiness: 'tu spa',
      theBusiness: 'el spa',
      atBusiness: 'en el spa',
      staffSingular: 'terapeuta',
      staffPlural: 'terapeutas',
    },
    medical: {
      businessLabel: 'consultorio',
      yourBusiness: 'tu consultorio',
      theBusiness: 'el consultorio',
      atBusiness: 'en el consultorio',
    },
    dentistry: {
      businessLabel: 'consultorio',
      yourBusiness: 'tu consultorio',
      theBusiness: 'el consultorio',
      atBusiness: 'en el consultorio',
    },
    kinesiology: {
      businessLabel: 'consultorio',
      yourBusiness: 'tu consultorio',
      theBusiness: 'el consultorio',
      atBusiness: 'en el consultorio',
    },
    psychology: {
      businessLabel: 'consultorio',
      yourBusiness: 'tu consultorio',
      theBusiness: 'el consultorio',
      atBusiness: 'en el consultorio',
    },
    veterinary: {
      businessLabel: 'veterinaria',
      yourBusiness: 'tu veterinaria',
      theBusiness: 'la veterinaria',
      atBusiness: 'en la veterinaria',
    },
    tattoo: {
      businessLabel: 'estudio',
      yourBusiness: 'tu estudio',
      theBusiness: 'el estudio',
      atBusiness: 'en el estudio',
      staffSingular: 'artista',
      staffPlural: 'artistas',
    },
    fitness: {
      businessLabel: 'centro',
      yourBusiness: 'tu centro',
      theBusiness: 'el centro',
      atBusiness: 'en el centro',
      staffSingular: 'entrenador',
      staffPlural: 'entrenadores',
    },
  };

  const resolved = {
    ...base,
    ...(overrides[businessType] || {}),
  };

  return {
    ...resolved,
    staffSingularCapitalized: capitalize(resolved.staffSingular),
    staffPluralCapitalized: capitalize(resolved.staffPlural),
  };
}
