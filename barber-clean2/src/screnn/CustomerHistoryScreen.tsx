import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';
import * as XLSX from 'xlsx';
import {
  Banknote,
  ChevronDown,
  CreditCard,
  Filter,
  Scissors,
  Search,
  Users,
  X,
} from 'lucide-react-native';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { useTheme } from '../context/ThemeContext';
import type { Theme } from '../context/ThemeContext';
import {
  CustomerHistoryResponse,
  ServiceOption,
  getCurrentUser,
  fetchCustomerHistory,
  fetchServices,
} from '../services/api';
import { hasProPlanAccess } from '../services/planAccess';
import LockedFeatureScreen from '../components/LockedFeatureScreen';

type Props = {
  navigation: any;
};

type PickerType = 'barber' | 'service' | 'month' | null;

type PickerOption = {
  key: string;
  label: string;
};

type CustomerRow = {
  key: string;
  customerName: string;
  phone: string;
  visitsCount: number;
  lastVisitAt: string;
  lastBarberName: string;
  lastService: string;
  lastPaymentMethod: 'cash' | 'transfer';
  totalRevenue: number;
};

const MONTH_LABELS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const TABLE_COLUMNS = [
  { key: 'customer', label: 'Cliente', width: 180 },
  { key: 'visits', label: 'Visitas', width: 90 },
  { key: 'lastVisit', label: 'Última visita', width: 150 },
  { key: 'barber', label: 'Último profesional', width: 150 },
  { key: 'service', label: 'Último servicio', width: 180 },
  { key: 'payment', label: 'Último pago', width: 130 },
  { key: 'price', label: 'Total gastado', width: 120 },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Cordoba',
  }).format(new Date(value));

const formatMonthYear = (value: string) =>
  new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Cordoba',
  }).format(new Date(value));

const hexToRgba = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(
    sanitized.length === 3 ? sanitized.repeat(2) : sanitized,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const hexToPdfRgb = (hex: string) => {
  const sanitized = hex.replace('#', '');
  const normalized = sanitized.length === 3 ? sanitized.repeat(2) : sanitized;
  const bigint = parseInt(normalized, 16);
  return rgb(
    ((bigint >> 16) & 255) / 255,
    ((bigint >> 8) & 255) / 255,
    (bigint & 255) / 255,
  );
};

const sanitizeFilePart = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const getPaymentLabel = (value: 'all' | 'cash' | 'transfer') => {
  if (value === 'cash') return 'Efectivo';
  if (value === 'transfer') return 'Transferencia';
  return 'Todos';
};

const getPaymentMethodLabel = (value: string) =>
  value === 'transfer' ? 'Transferencia' : 'Efectivo';

const parseDataUrl = (value: string) => {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    base64: match[2],
  };
};

const sanitizePdfText = (value: string | number | null | undefined) =>
  String(value ?? '')
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');

const buildShareUrl = (filePath: string) =>
  filePath.startsWith('file://') ? filePath : `file://${filePath}`;

async function shareExportedFile({
  filePath,
  fileName,
  type,
}: {
  filePath: string;
  fileName: string;
  type: string;
}) {
  await Share.open({
    title: fileName,
    filename: fileName,
    url: buildShareUrl(filePath),
    type,
    failOnCancel: false,
    subject: fileName,
  });
}

function CustomerHistoryScreen({ navigation }: Props) {
  const { theme, businessCopy } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const now = useMemo(() => new Date(), []);

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<CustomerHistoryResponse | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<
    'all' | 'cash' | 'transfer'
  >('all');
  const [selectedBarber, setSelectedBarber] = useState('all');
  const [selectedService, setSelectedService] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [visitsFilterInput, setVisitsFilterInput] = useState('');
  const [customerSegment, setCustomerSegment] = useState<
    'all' | 'new' | 'recurrent'
  >('all');
  const [customerSort, setCustomerSort] = useState<'recent' | 'most' | 'least'>(
    'most',
  );
  const [activePicker, setActivePicker] = useState<PickerType>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  const monthOptions = useMemo<PickerOption[]>(
    () =>
      MONTH_LABELS.map((label, index) => ({
        key: String(index + 1),
        label: `${label} ${now.getFullYear()}`,
      })),
    [now],
  );

  const loadData = useCallback(
    async (isRefresh = false) => {
      try {
        if (!isRefresh) setLoading(true);
        const currentUser = await getCurrentUser();
        const canUseFeature = hasProPlanAccess(currentUser?.user);
        setHasAccess(canUseFeature);
        if (!canUseFeature) return;
        const [historyResponse, servicesResponse] = await Promise.all([
          fetchCustomerHistory({
            year: now.getFullYear(),
            month: selectedMonth,
            paymentMethod: paymentFilter === 'all' ? undefined : paymentFilter,
          }),
          fetchServices(),
        ]);
        setData(historyResponse);
        setServices(servicesResponse?.services ?? []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [now, paymentFilter, selectedMonth],
  );

  useFocusEffect(
    useCallback(() => {
      loadData(false);
    }, [loadData]),
  );

  const barberOptions = useMemo<PickerOption[]>(() => {
    const names = (data?.items ?? []).map(item => item.barberName).filter(Boolean);
    return [
      { key: 'all', label: `Todos los ${businessCopy.staffPlural}` },
      ...Array.from(new Set(names)).map(name => ({
        key: name,
        label: name,
      })),
    ];
  }, [businessCopy.staffPlural, data]);

  const serviceOptions = useMemo<PickerOption[]>(() => {
    const apiServices = services.map(item => item.name).filter(Boolean);
    const historyServices = (data?.items ?? []).map(item => item.service).filter(Boolean);
    return [
      { key: 'all', label: 'Todos los servicios' },
      ...Array.from(new Set([...apiServices, ...historyServices])).map(name => ({
        key: name,
        label: name,
      })),
    ];
  }, [data, services]);

  const search = searchInput.trim().toLowerCase();

  const visitRows = useMemo(() => {
    return (data?.items ?? []).filter(item => {
      const matchesBarber =
        selectedBarber === 'all' || item.barberName === selectedBarber;
      const matchesService =
        selectedService === 'all' || item.service === selectedService;
      const matchesSearch =
        !search ||
        item.customerName.toLowerCase().includes(search) ||
        item.barberName.toLowerCase().includes(search) ||
        item.service.toLowerCase().includes(search) ||
        String(item.phone || '')
          .toLowerCase()
          .includes(search);

      return matchesBarber && matchesService && matchesSearch;
    });
  }, [
    data,
    search,
    selectedBarber,
    selectedService,
  ]);

  const customerRows = useMemo<CustomerRow[]>(() => {
    const rows = new Map<string, CustomerRow>();

    visitRows.forEach(item => {
      const key = `${item.customerName}|${item.phone || ''}`.toLowerCase();
      const current = rows.get(key);
      if (!current) {
        rows.set(key, {
          key,
          customerName: item.customerName,
          phone: item.phone || '',
          visitsCount: 1,
          lastVisitAt: item.startTime,
          lastBarberName: item.barberName,
          lastService: item.service,
          lastPaymentMethod: item.paymentMethod,
          totalRevenue: Number(item.price || 0),
        });
        return;
      }

      current.visitsCount += 1;
      current.totalRevenue += Number(item.price || 0);
      if (new Date(item.startTime).getTime() > new Date(current.lastVisitAt).getTime()) {
        current.lastVisitAt = item.startTime;
        current.lastBarberName = item.barberName;
        current.lastService = item.service;
        current.lastPaymentMethod = item.paymentMethod;
      }
    });

    const minVisits = Number(visitsFilterInput);

    return [...rows.values()]
      .filter(row => {
        if (customerSegment === 'new') return row.visitsCount === 1;
        if (customerSegment === 'recurrent') return row.visitsCount > 1;
        return true;
      })
      .filter(row => {
        if (!Number.isFinite(minVisits) || minVisits <= 1) return true;
        return row.visitsCount >= minVisits;
      })
      .sort((a, b) => {
        const aLastVisit = new Date(a.lastVisitAt).getTime();
        const bLastVisit = new Date(b.lastVisitAt).getTime();

        if (customerSort === 'most') {
          return (
            b.visitsCount - a.visitsCount ||
            bLastVisit - aLastVisit ||
            b.totalRevenue - a.totalRevenue
          );
        }

        if (customerSort === 'least') {
          return (
            a.visitsCount - b.visitsCount ||
            bLastVisit - aLastVisit ||
            b.totalRevenue - a.totalRevenue
          );
        }

        return bLastVisit - aLastVisit || b.visitsCount - a.visitsCount;
      });
  }, [customerSegment, customerSort, visitRows, visitsFilterInput]);

  const summary = useMemo(() => {
    const totalRevenue = visitRows.reduce(
      (acc, item) => acc + Number(item.price || 0),
      0,
    );

    return {
      servicesCount: visitRows.length,
      uniqueClients: customerRows.length,
      totalRevenue,
      cashRevenue: visitRows
        .filter(item => item.paymentMethod === 'cash')
        .reduce((acc, item) => acc + Number(item.price || 0), 0),
      transferRevenue: visitRows
        .filter(item => item.paymentMethod === 'transfer')
        .reduce((acc, item) => acc + Number(item.price || 0), 0),
      cashCount: visitRows.filter(item => item.paymentMethod === 'cash').length,
      transferCount: visitRows.filter(item => item.paymentMethod === 'transfer')
        .length,
    };
  }, [customerRows.length, visitRows]);

  const activeContextLabel = useMemo(() => {
    if (selectedBarber !== 'all') {
      return `${businessCopy.staffSingularCapitalized}: ${selectedBarber}`;
    }
    if (selectedService !== 'all') return `Servicio: ${selectedService}`;
    return 'Vista general';
  }, [businessCopy.staffSingularCapitalized, selectedBarber, selectedService]);

  const sortLabel = useMemo(() => {
    if (customerSort === 'most') return 'Más frecuente';
    if (customerSort === 'least') return 'Menos frecuente';
    return 'Más reciente';
  }, [customerSort]);

  const hasActiveFilters =
    paymentFilter !== 'all' ||
    selectedBarber !== 'all' ||
    selectedService !== 'all' ||
    Boolean(searchInput.trim()) ||
    Boolean(visitsFilterInput.trim()) ||
    customerSegment !== 'all';

  const pickerOptions = useMemo(() => {
    if (activePicker === 'barber') return barberOptions;
    if (activePicker === 'service') return serviceOptions;
    if (activePicker === 'month') return monthOptions;
    return [];
  }, [activePicker, barberOptions, monthOptions, serviceOptions]);

  const pickerTitle = useMemo(() => {
    if (activePicker === 'barber') {
      return `Elegí un ${businessCopy.staffSingular}`;
    }
    if (activePicker === 'service') return 'Elegí un servicio';
    if (activePicker === 'month') return 'Elegí un mes';
    return '';
  }, [activePicker, businessCopy.staffSingular]);

  const selectedBarberLabel =
    barberOptions.find(item => item.key === selectedBarber)?.label ??
    `Todos los ${businessCopy.staffPlural}`;
  const selectedServiceLabel =
    serviceOptions.find(item => item.key === selectedService)?.label ??
    'Todos los servicios';
  const selectedMonthLabel =
    monthOptions.find(item => Number(item.key) === selectedMonth)?.label ??
    `${MONTH_LABELS[selectedMonth - 1]} ${now.getFullYear()}`;

  const handleSelectOption = (option: PickerOption) => {
    if (activePicker === 'barber') {
      setSelectedBarber(option.key);
    } else if (activePicker === 'service') {
      setSelectedService(option.key);
    } else if (activePicker === 'month') {
      setSelectedMonth(Number(option.key));
    }
    setActivePicker(null);
  };

  const clearAllFilters = () => {
    setPaymentFilter('all');
    setSelectedBarber('all');
    setSelectedService('all');
    setSearchInput('');
    setVisitsFilterInput('');
    setCustomerSegment('all');
    setCustomerSort('most');
  };

  // Export movido a Caja (incluye todo). Se conserva por compatibilidad.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExportExcel = async () => {
    const header = [
      'Cliente',
      'Visitas',
      'Última visita',
      `Último ${businessCopy.staffSingular}`,
      'Último servicio',
      'Telefono',
      'Último pago',
      'Total gastado',
    ];
    const rows = customerRows.map(item => [
      item.customerName,
      item.visitsCount,
      formatDateTime(item.lastVisitAt),
      item.lastBarberName,
      item.lastService,
      item.phone || '',
      getPaymentMethodLabel(item.lastPaymentMethod),
      Number(item.totalRevenue ?? 0),
    ]);

    try {
      const fileDate = `${now.getFullYear()}-${String(selectedMonth).padStart(2, '0')}`;
      const safeContext = sanitizeFilePart(activeContextLabel);
      const fileName = `historial-${fileDate}${safeContext ? `-${safeContext}` : ''}.xlsx`;
      const basePath =
        RNFS.TemporaryDirectoryPath || RNFS.CachesDirectoryPath;
      const filePath = `${basePath}/${fileName}`;

      const summarySheetData = [
        ['Historial de clientes'],
        ['Periodo', selectedMonthLabel],
        ['Vista', activeContextLabel],
        ['Pago', getPaymentLabel(paymentFilter)],
        ['Busqueda', searchInput.trim() || 'Sin filtro'],
        [],
        ['Servicios en el período', summary.servicesCount],
        ['Clientes únicos', summary.uniqueClients],
        ['Ingresos totales', summary.totalRevenue],
        ['Ingresos efectivo', summary.cashRevenue],
        ['Ingresos transferencia', summary.transferRevenue],
        ['Cobros efectivo', summary.cashCount],
        ['Cobros transferencia', summary.transferCount],
      ];

      const detailSheetData = [
        ['Historial filtrado'],
        ['Periodo', selectedMonthLabel],
        ['Vista', activeContextLabel],
        [],
        header,
        ...rows,
        [],
        ['Totales', '', '', '', '', 'Cantidad', summary.servicesCount],
        ['Ingresos', '', '', '', '', 'Monto total', summary.totalRevenue],
      ];

      const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData);
      const worksheet = XLSX.utils.aoa_to_sheet(detailSheetData);

      summarySheet['!cols'] = [
        { wch: 24 },
        { wch: 24 },
      ];

      worksheet['!cols'] = [
        { wch: 24 },
        { wch: 10 },
        { wch: 20 },
        { wch: 20 },
        { wch: 24 },
        { wch: 18 },
        { wch: 16 },
        { wch: 14 },
      ];
      worksheet['!rows'] = [
        { hpt: 24 },
        { hpt: 20 },
        { hpt: 20 },
        { hpt: 10 },
        { hpt: 22 },
      ];
      worksheet['!autofilter'] = {
        ref: `A5:H${Math.max(5, rows.length + 5)}`,
      };

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Historial');
      const workbookBase64 = XLSX.write(workbook, {
        type: 'base64',
        bookType: 'xlsx',
      });

      await RNFS.writeFile(filePath, workbookBase64, 'base64');

      await shareExportedFile({
        filePath,
        fileName,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } catch (err) {
      console.error(err);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleExportPdf = async () => {
    try {
      const pdfDoc = await PDFDocument.create();
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const pageWidth = 842;
      const pageHeight = 595;
      const margin = 28;
      const rowHeight = 24;
      const headerRowHeight = 26;
      const tableStartX = margin;
      const columnWidths = [118, 112, 92, 150, 108, 104, 74];
      const cardGap = 12;
      const cardWidth = (pageWidth - margin * 2 - cardGap * 2) / 3;
      const primaryColor = hexToPdfRgb(theme.primary);
      const pageBackgroundColor = rgb(1, 1, 1);
      const panelColor = rgb(0.985, 0.988, 0.993);
      const panelAltColor = rgb(0.94, 0.955, 0.975);
      const textColor = rgb(0.11, 0.14, 0.18);
      const mutedColor = rgb(0.42, 0.46, 0.52);
      const borderColor = rgb(0.83, 0.86, 0.9);
      const cardFillColor = rgb(0.972, 0.978, 0.988);
      const cashBg = rgb(0.9, 0.97, 0.92);
      const transferBg = rgb(0.91, 0.94, 0.99);
      const cashText = rgb(0.12, 0.48, 0.2);
      const transferText = rgb(0.18, 0.35, 0.7);
      const priceColor = rgb(0.73, 0.34, 0.05);
      const paymentLabel = getPaymentLabel(paymentFilter);
      const themeSecondaryColor = hexToPdfRgb(theme.secondary);

      let embeddedLogo:
        | Awaited<ReturnType<PDFDocument['embedPng']>>
        | Awaited<ReturnType<PDFDocument['embedJpg']>>
        | null = null;

      const tryEmbedLogo = async () => {
        try {
          if (
            theme.logo &&
            typeof theme.logo === 'object' &&
            'uri' in theme.logo &&
            typeof theme.logo.uri === 'string'
          ) {
            const parsed = parseDataUrl(theme.logo.uri);
            if (parsed) {
              embeddedLogo = parsed.mimeType.includes('png')
                ? await pdfDoc.embedPng(parsed.base64)
                : await pdfDoc.embedJpg(parsed.base64);
              return;
            }
          }

          const resolvedAsset = Image.resolveAssetSource(theme.logo);
          const assetUri = resolvedAsset?.uri;
          if (!assetUri) return;

          const response = await fetch(assetUri);
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const lowerUri = assetUri.toLowerCase();

          if (lowerUri.includes('.png')) {
            embeddedLogo = await pdfDoc.embedPng(bytes);
            return;
          }

          if (
            lowerUri.includes('.jpg') ||
            lowerUri.includes('.jpeg') ||
            lowerUri.includes('image/jpeg')
          ) {
            embeddedLogo = await pdfDoc.embedJpg(bytes);
          }
        } catch (_error) {}
      };

      await tryEmbedLogo();

      const drawPageFrame = (page: any) => {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight,
          color: pageBackgroundColor,
        });

        page.drawRectangle({
          x: margin,
          y: pageHeight - 68,
          width: pageWidth - margin * 2,
          height: 2,
          color: primaryColor,
        });

        page.drawText(sanitizePdfText('HISTORIAL'), {
          x: margin,
          y: pageHeight - 42,
          size: 16,
          font: fontBold,
          color: textColor,
        });

        page.drawText(sanitizePdfText('Reporte de clientes, servicios y ventas'), {
          x: margin,
          y: pageHeight - 58,
          size: 9,
          font: fontRegular,
          color: mutedColor,
        });

        page.drawText(sanitizePdfText(selectedMonthLabel), {
          x: pageWidth - margin - 140,
          y: pageHeight - 42,
          size: 10,
          font: fontRegular,
          color: mutedColor,
        });

        if (embeddedLogo) {
          const maxWidth = 44;
          const maxHeight = 44;
          const scale = Math.min(
            maxWidth / embeddedLogo.width,
            maxHeight / embeddedLogo.height,
          );
          const width = embeddedLogo.width * scale;
          const height = embeddedLogo.height * scale;

          page.drawRectangle({
            x: pageWidth - margin - 60,
            y: pageHeight - 60,
            width: 52,
            height: 52,
            color: pageBackgroundColor,
            borderColor,
            borderWidth: 0.8,
          });

          page.drawImage(embeddedLogo, {
            x: pageWidth - margin - 56 + (44 - width) / 2,
            y: pageHeight - 56 + (44 - height) / 2,
            width,
            height,
          });
        }
      };

      const drawSummaryCard = (
        page: any,
        x: number,
        y: number,
        title: string,
        value: string,
      ) => {
        page.drawRectangle({
          x,
          y,
          width: cardWidth,
          height: 58,
          color: pageBackgroundColor,
          borderColor,
          borderWidth: 1,
        });

        page.drawText(sanitizePdfText(title.toUpperCase()), {
          x: x + 12,
          y: y + 40,
          size: 8,
          font: fontBold,
          color: mutedColor,
        });

        page.drawText(sanitizePdfText(value), {
          x: x + 12,
          y: y + 16,
          size: 15,
          font: fontBold,
          color: textColor,
        });
      };

      const drawFiltersBar = (page: any, y: number) => {
        page.drawRectangle({
          x: margin,
          y,
          width: pageWidth - margin * 2,
          height: 54,
          color: pageBackgroundColor,
          borderColor,
          borderWidth: 1,
        });

        const sections = [
          [businessCopy.staffSingularCapitalized, selectedBarberLabel],
          ['Servicio', selectedServiceLabel],
          ['Buscar', searchInput.trim() || 'Sin filtro'],
          ['Pago', paymentLabel],
        ];

        const sectionWidth = (pageWidth - margin * 2 - 24) / sections.length;
        sections.forEach(([label, value], index) => {
          const sectionX = margin + 12 + sectionWidth * index;
          page.drawText(sanitizePdfText(label.toUpperCase()), {
            x: sectionX,
            y: y + 36,
            size: 7,
            font: fontBold,
            color: mutedColor,
          });
          page.drawText(sanitizePdfText(value), {
            x: sectionX,
            y: y + 16,
            size: 10,
            font: fontRegular,
            color: textColor,
            maxWidth: sectionWidth - 12,
          });
        });
      };

      const drawTableHeader = (page: any, y: number) => {
        page.drawRectangle({
          x: tableStartX,
          y,
          width: columnWidths.reduce((acc, width) => acc + width, 0),
          height: headerRowHeight,
          color: panelAltColor,
          borderColor,
          borderWidth: 1,
        });

        let currentX = tableStartX;
        TABLE_COLUMNS.forEach((column, index) => {
          page.drawText(sanitizePdfText(column.label.toUpperCase()), {
            x: currentX + 8,
            y: y + 8,
            size: 7,
            font: fontBold,
            color: mutedColor,
          });
          currentX += columnWidths[index];
        });
      };

      const drawPaymentBadge = (
        page: any,
        x: number,
        y: number,
        method: string,
      ) => {
        const isTransfer = method === 'transfer';
        const badgeWidth = isTransfer ? 76 : 50;
        page.drawRectangle({
          x,
          y,
          width: badgeWidth,
          height: 14,
          color: isTransfer ? transferBg : cashBg,
          borderColor: isTransfer ? transferText : cashText,
          borderWidth: 0.6,
        });
        page.drawText(sanitizePdfText(getPaymentMethodLabel(method)), {
          x: x + 6,
          y: y + 4,
          size: 7,
          font: fontBold,
          color: isTransfer ? transferText : cashText,
        });
      };

      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let cursorY = pageHeight - 118;
      let pageNumber = 1;

      drawPageFrame(page);
      drawSummaryCard(page, margin, cursorY, 'Servicios', String(summary.servicesCount));
      drawSummaryCard(
        page,
        margin + cardWidth + cardGap,
        cursorY,
        'Clientes únicos',
        String(summary.uniqueClients),
      );
      drawSummaryCard(
        page,
        margin + (cardWidth + cardGap) * 2,
        cursorY,
        'Ingresos',
        formatCurrency(summary.totalRevenue),
      );

      cursorY -= 74;
      drawFiltersBar(page, cursorY);
      cursorY -= 42;
      drawTableHeader(page, cursorY);
      cursorY -= rowHeight;

      if (!customerRows.length) {
        page.drawText(
          sanitizePdfText('No hay resultados para exportar con el filtro actual.'),
          {
          x: margin,
          y: cursorY,
          size: 11,
          font: fontRegular,
          color: mutedColor,
          },
        );
      }

      customerRows.forEach((item, index) => {
        if (cursorY < 72) {
          page.drawText(sanitizePdfText(`Página ${pageNumber}`), {
            x: pageWidth - margin - 42,
            y: 24,
            size: 9,
            font: fontRegular,
            color: mutedColor,
          });
          pageNumber += 1;
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          drawPageFrame(page);
          cursorY = pageHeight - 92;
          drawTableHeader(page, cursorY);
          cursorY -= rowHeight;
        }

        page.drawRectangle({
          x: tableStartX,
          y: cursorY,
          width: columnWidths.reduce((acc, width) => acc + width, 0),
          height: rowHeight,
          color: index % 2 === 0 ? panelColor : panelAltColor,
          borderColor,
          borderWidth: 0.4,
        });

        const values = [
          item.customerName,
          String(item.visitsCount),
          formatDateTime(item.lastVisitAt),
          item.lastBarberName,
          item.lastService,
        ];

        let currentX = tableStartX;
        values.forEach((value, valueIndex) => {
          page.drawText(sanitizePdfText(value), {
            x: currentX + 8,
            y: cursorY + 8,
            size: 8,
            font: valueIndex === 0 ? fontBold : fontRegular,
            color: textColor,
            maxWidth: columnWidths[valueIndex] - 12,
          });
          currentX += columnWidths[valueIndex];
        });

        drawPaymentBadge(page, currentX + 8, cursorY + 5, item.lastPaymentMethod);
        currentX += columnWidths[5];

        page.drawText(sanitizePdfText(formatCurrency(item.totalRevenue)), {
          x: currentX + 8,
          y: cursorY + 8,
          size: 8,
          font: fontBold,
          color: priceColor,
          maxWidth: columnWidths[6] - 10,
        });

        cursorY -= rowHeight;
      });

      page.drawText(sanitizePdfText(`Página ${pageNumber}`), {
        x: pageWidth - margin - 42,
        y: 24,
        size: 9,
        font: fontRegular,
        color: mutedColor,
      });

      const fileDate = `${now.getFullYear()}-${String(selectedMonth).padStart(2, '0')}`;
      const safeContext = sanitizeFilePart(activeContextLabel);
      const fileName = `historial-${fileDate}${safeContext ? `-${safeContext}` : ''}.pdf`;
      const basePath =
        RNFS.TemporaryDirectoryPath || RNFS.CachesDirectoryPath;
      const filePath = `${basePath}/${fileName}`;
      const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: false });

      await RNFS.writeFile(filePath, pdfBase64, 'base64');

      await shareExportedFile({
        filePath,
        fileName,
        type: 'application/pdf',
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (hasAccess === false) {
    return (
      <LockedFeatureScreen
        theme={theme}
        navigation={navigation}
        title="Historial bloqueado"
        body="La información e historial de clientes está disponible con plan Pro."
      />
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
       

          <View style={{ flex: 1 }}>
            <Text style={styles.headerEyebrow}>HISTORIAL</Text>
            <Text style={styles.headerTitle}>Servicios y ventas</Text>
          
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData(true);
            }}
            tintColor={theme.primary}
          />
        }
      >
        <View style={styles.summaryRow}>
          <SummaryCard
            styles={styles}
            icon={<Scissors size={15} color={theme.primary} />}
            value={String(summary.servicesCount)}
            label="Servicios"
          />
          <SummaryCard
            styles={styles}
            icon={<Users size={15} color={theme.primary} />}
            value={String(summary.uniqueClients)}
            label="Clientes"
          />
          <SummaryCard
            styles={styles}
            icon={<Banknote size={15} color={theme.primary} />}
            value={formatCurrency(summary.totalRevenue)}
            label="Ingresos"
            compact
          />
        </View>

        <View style={styles.paymentBreakdownRow}>
          <View style={styles.paymentBreakdownCard}>
            <View style={styles.paymentBreakdownTop}>
              <Banknote size={14} color={theme.primary} />
              <Text style={styles.paymentBreakdownLabel}>Efectivo</Text>
            </View>
            <Text style={styles.paymentBreakdownValue}>
              {formatCurrency(summary.cashRevenue)}
            </Text>
            <Text style={styles.paymentBreakdownMeta}>
              {summary.cashCount} cobros
            </Text>
          </View>

          <View style={styles.paymentBreakdownCard}>
            <View style={styles.paymentBreakdownTop}>
              <CreditCard size={14} color={theme.primary} />
              <Text style={styles.paymentBreakdownLabel}>Transferencia</Text>
            </View>
            <Text style={styles.paymentBreakdownValue}>
              {formatCurrency(summary.transferRevenue)}
            </Text>
            <Text style={styles.paymentBreakdownMeta}>
              {summary.transferCount} cobros
            </Text>
          </View>
        </View>

        <View style={styles.filtersCard}>
          <View style={styles.filtersCardHeader}>
            <View>
              <Text style={styles.filtersTitle}>Filtros</Text>
              <Text style={styles.filtersSubtitle}>{activeContextLabel}</Text>
            </View>

            {hasActiveFilters ? (
              <Pressable style={styles.clearButton} onPress={clearAllFilters}>
                <X size={13} color={theme.textSecondary} />
                <Text style={styles.clearButtonText}>Limpiar</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.searchFieldWrap}>
            <Search size={16} color={theme.textMuted} />
            <TextInput
              placeholder={`Cliente, teléfono, ${businessCopy.staffSingular} o servicio`}
              placeholderTextColor={theme.placeholder}
              style={styles.searchField}
              value={searchInput}
              onChangeText={setSearchInput}
            />
            {searchInput.trim() ? (
              <Pressable
                style={styles.inlineClearBtn}
                onPress={() => setSearchInput('')}
              >
                <X size={12} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.controlsGrid}>
            <SelectControl
              label={businessCopy.staffSingularCapitalized}
              value={selectedBarberLabel}
              onPress={() => setActivePicker('barber')}
              styles={styles}
              theme={theme}
            />
            <SelectControl
              label="Servicio"
              value={selectedServiceLabel}
              onPress={() => setActivePicker('service')}
              styles={styles}
              theme={theme}
            />
            <SelectControl
              label="Mes"
              value={selectedMonthLabel}
              onPress={() => setActivePicker('month')}
              styles={styles}
              theme={theme}
              fullWidth
            />
          </View>

          <View style={styles.paymentRow}>
            <PaymentFilterButton
              label="Todos"
              active={paymentFilter === 'all'}
              onPress={() => setPaymentFilter('all')}
              styles={styles}
            />
            <PaymentFilterButton
              label="Efectivo"
              active={paymentFilter === 'cash'}
              icon={
                <Banknote
                  size={14}
                  color={
                    paymentFilter === 'cash'
                      ? theme.textOnPrimary
                      : theme.primary
                  }
                />
              }
              onPress={() =>
                setPaymentFilter(current => (current === 'cash' ? 'all' : 'cash'))
              }
              styles={styles}
              cash
            />
            <PaymentFilterButton
              label="Transferencia"
              active={paymentFilter === 'transfer'}
              icon={
                <CreditCard
                  size={14}
                  color={
                    paymentFilter === 'transfer'
                      ? theme.textOnPrimary
                      : theme.primary
                  }
                />
              }
              onPress={() =>
                setPaymentFilter(current =>
                  current === 'transfer' ? 'all' : 'transfer',
                )
              }
              styles={styles}
              transfer
            />
          </View>

          <View style={styles.customerControlsRow}>
            <View style={styles.visitsFilterBox}>
              <Text style={styles.selectLabel}>Mín. veces</Text>
              <TextInput
                placeholder="1"
                placeholderTextColor={theme.placeholder}
                style={styles.visitsFilterInput}
                value={visitsFilterInput}
                onChangeText={setVisitsFilterInput}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.customerSortRow}>
              <Pressable
                style={[
                  styles.frequencyChip,
                  customerSort === 'most' && styles.frequencyChipActive,
                ]}
                onPress={() => setCustomerSort('most')}
              >
                <Text
                  style={[
                    styles.frequencyChipText,
                    customerSort === 'most' && styles.frequencyChipTextActive,
                  ]}
                >
                  Más frecuente
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.frequencyChip,
                  customerSort === 'least' && styles.frequencyChipActive,
                ]}
                onPress={() => setCustomerSort('least')}
              >
                <Text
                  style={[
                    styles.frequencyChipText,
                    customerSort === 'least' && styles.frequencyChipTextActive,
                  ]}
                >
                  Menos frecuente
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.frequencyChip,
                  customerSort === 'recent' && styles.frequencyChipActive,
                ]}
                onPress={() => setCustomerSort('recent')}
              >
                <Text
                  style={[
                    styles.frequencyChipText,
                    customerSort === 'recent' && styles.frequencyChipTextActive,
                  ]}
                >
                  Más reciente
                </Text>
              </Pressable>
            </View>

            <View style={styles.customerSortRow}>
              <Pressable
                style={[
                  styles.frequencyChip,
                  customerSegment === 'all' && styles.frequencyChipActive,
                ]}
                onPress={() => setCustomerSegment('all')}
              >
                <Text
                  style={[
                    styles.frequencyChipText,
                    customerSegment === 'all' && styles.frequencyChipTextActive,
                  ]}
                >
                  Todos
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.frequencyChip,
                  customerSegment === 'new' && styles.frequencyChipActive,
                ]}
                onPress={() => setCustomerSegment('new')}
              >
                <Text
                  style={[
                    styles.frequencyChipText,
                    customerSegment === 'new' && styles.frequencyChipTextActive,
                  ]}
                >
                  Solo nuevos
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.frequencyChip,
                  customerSegment === 'recurrent' &&
                    styles.frequencyChipActive,
                ]}
                onPress={() => setCustomerSegment('recurrent')}
              >
                <Text
                  style={[
                    styles.frequencyChipText,
                    customerSegment === 'recurrent' &&
                      styles.frequencyChipTextActive,
                  ]}
                >
                  Solo recurrentes
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.clientInsightRow}>
            <View style={styles.clientInsightCard}>
              <Text style={styles.clientInsightLabel}>Orden actual</Text>
              <Text style={styles.clientInsightValue}>{sortLabel}</Text>
            </View>
            <View style={styles.clientInsightCard}>
              <Text style={styles.clientInsightLabel}>Clientes filtrados</Text>
              <Text style={styles.clientInsightValue}>{customerRows.length}</Text>
            </View>
          </View>
        </View>

        <View style={styles.resultsHeader}>
          <View>
              <Text style={styles.resultsTitle}>Clientes del período</Text>
              <Text style={styles.resultsSubtitle}>
              {customerRows.length} clientes encontrados · ordenado por {sortLabel.toLowerCase()}
              </Text>
            </View>
          <View style={styles.resultsHeaderActions}>
            <View style={styles.resultsBadge}>
              <Filter size={12} color={theme.primary} />
              <Text style={styles.resultsBadgeText}>{activeContextLabel}</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 42 }} />
        ) : customerRows.length ? (
          <View style={styles.tableCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.tableHeaderRow}>
                  {TABLE_COLUMNS.map(column => (
                    <View
                      key={column.key}
                      style={[styles.tableHeaderCell, { width: column.width }]}
                    >
                      <Text style={styles.tableHeaderText}>{column.label}</Text>
                    </View>
                  ))}
                </View>

                {customerRows.map((item, index) => (
                  <View
                    key={item.key}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowAlt,
                    ]}
                  >
                    <TableCell styles={styles} width={180} emphasis>
                      {item.customerName}
                    </TableCell>
                    <TableCell styles={styles} width={90}>
                      {item.visitsCount}x
                    </TableCell>
                    <TableCell styles={styles} width={150}>
                      {formatDateTime(item.lastVisitAt)}
                    </TableCell>
                    <TableCell styles={styles} width={150}>
                      {item.lastBarberName}
                    </TableCell>
                    <TableCell styles={styles} width={180}>
                      {item.lastService}
                    </TableCell>
                    <View style={[styles.tableCell, { width: 130 }]}>
                      <View
                        style={[
                          styles.paymentBadge,
                          item.lastPaymentMethod === 'transfer'
                            ? styles.paymentBadgeTransfer
                            : styles.paymentBadgeCash,
                        ]}
                      >
                        <Text
                          style={[
                            styles.paymentBadgeText,
                            item.lastPaymentMethod === 'transfer'
                              ? styles.paymentBadgeTextTransfer
                              : styles.paymentBadgeTextCash,
                          ]}
                        >
                          {item.lastPaymentMethod === 'transfer'
                            ? 'Transferencia'
                            : 'Efectivo'}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.tableCell,
                        styles.tableCellPrice,
                        { width: 120 },
                      ]}
                    >
                      <Text style={styles.priceText}>
                        {formatCurrency(item.totalRevenue)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No hay resultados con ese filtro</Text>
            <Text style={styles.emptyText}>
              {`Probá cambiar ${businessCopy.staffSingular}, servicio, mes o búsqueda para volver al`}
              resultado general.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={activePicker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivePicker(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setActivePicker(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{pickerTitle}</Text>
              <Pressable
                style={styles.modalClose}
                onPress={() => setActivePicker(null)}
              >
                <X size={16} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalList}
            >
              {pickerOptions.map(option => (
                <Pressable
                  key={option.key}
                  style={styles.modalOption}
                  onPress={() => handleSelectOption(option)}
                >
                  <Text style={styles.modalOptionText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SummaryCard({
  styles,
  icon,
  value,
  label,
  compact = false,
}: {
  styles: ReturnType<typeof makeStyles>;
  icon: React.ReactNode;
  value: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIconWrap}>{icon}</View>
      <Text style={[styles.summaryValue, compact && styles.summaryValueCompact]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function SelectControl({
  label,
  value,
  onPress,
  styles,
  theme,
  fullWidth = false,
}: {
  label: string;
  value: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  theme: Theme;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      style={[styles.selectControl, fullWidth && styles.selectControlFull]}
      onPress={onPress}
    >
      <Text style={styles.selectLabel}>{label}</Text>
      <View style={styles.selectValueRow}>
        <Text style={styles.selectValue} numberOfLines={1}>
          {value}
        </Text>
        <ChevronDown size={15} color={theme.textMuted} />
      </View>
    </Pressable>
  );
}

function PaymentFilterButton({
  label,
  active,
  onPress,
  styles,
  icon,
  cash = false,
  transfer = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  icon?: React.ReactNode;
  cash?: boolean;
  transfer?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.paymentButton,
        active && styles.paymentButtonActive,
        cash && active && styles.paymentButtonCash,
        transfer && active && styles.paymentButtonTransfer,
      ]}
      onPress={onPress}
    >
      {icon}
      <Text
        style={[
          styles.paymentButtonText,
          active && styles.paymentButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TableCell({
  styles,
  width,
  children,
  emphasis = false,
}: {
  styles: ReturnType<typeof makeStyles>;
  width: number;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <View style={[styles.tableCell, { width }]}>
      <Text
        style={[styles.tableCellText, emphasis && styles.tableCellTextStrong]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    headerContainer: {
      paddingHorizontal: 20,
      paddingTop: Platform.OS === 'ios' ? 60 : 28,
      paddingBottom: 16,
      backgroundColor: theme.background,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
 
    headerEyebrow: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    headerTitle: {
      color: theme.textPrimary,
      fontSize: 28,
      fontWeight: '900',
      marginTop: 4,
    },

    scrollBody: {
      paddingHorizontal: 20,
      paddingBottom: 120,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 6,
      marginBottom: 16,
    },
    paymentBreakdownRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    paymentBreakdownCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
    },
    paymentBreakdownTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    paymentBreakdownLabel: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '800',
    },
    paymentBreakdownValue: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '900',
    },
    paymentBreakdownMeta: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 4,
    },
    customerControlsRow: {
      gap: 12,
      marginTop: 14,
    },
    visitsFilterBox: {
      gap: 6,
    },
    visitsFilterInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.input,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    customerSortRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingBottom: 12,
    },
    clientInsightRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 2,
    },
    clientInsightCard: {
      flex: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    clientInsightLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginBottom: 5,
    },
    clientInsightValue: {
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    frequencyChip: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
      paddingHorizontal: 12,
      borderRadius: 14,
      paddingVertical: 6,
      width: '30%',
    },
    frequencyChipActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    frequencyChipText: {
      color: theme.textPrimary,
      fontSize: 10,
      fontWeight: '700',
      textAlign: 'center',
    },
    frequencyChipTextActive: {
      color: theme.textOnPrimary,
    },
    summaryCard: {
      flex: 1,
      backgroundColor: theme.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      minHeight: 112,
    },
    summaryIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: hexToRgba(theme.primary, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    summaryValue: {
      color: theme.textPrimary,
      fontSize: 24,
      fontWeight: '900',
    },
    summaryValueCompact: {
      fontSize: 15,
      lineHeight: 19,
    },
    summaryLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 6,
    },
    filtersCard: {
      backgroundColor: theme.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      marginBottom: 18,
    },
    filtersCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    filtersTitle: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: '800',
    },
    filtersSubtitle: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },
    clearButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    clearButtonText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '800',
    },
    searchFieldWrap: {
      height: 50,
      borderRadius: 16,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      marginBottom: 14,
    },
    searchField: {
      flex: 1,
      color: theme.textPrimary,
      fontSize: 14,
    },
    inlineClearBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surfaceAlt,
    },
    controlsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
    },
    selectControl: {
      width: '48.5%',
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      padding: 12,
    },
    selectControlFull: {
      width: '100%',
    },
    selectLabel: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 7,
    },
    selectValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    selectValue: {
      flex: 1,
      color: theme.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },
    paymentRow: {
      flexDirection: 'row',
      gap: 5,
      marginTop: 14,
    },
    paymentButton: {
      flex: 1,
      height: 40,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: theme.input,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    paymentButtonActive: {
      borderColor: theme.primary,
    },
    paymentButtonCash: {
      backgroundColor: 'rgba(91, 227, 139, 0.18)',
      borderColor: 'rgba(91, 227, 139, 1)',
    },
    paymentButtonTransfer: {
      backgroundColor: hexToRgba(theme.primary, 0.18),
      borderColor: hexToRgba(theme.primary, 0.42),
    },
    paymentButtonText: {
      color: theme.textMuted,
      fontSize: 10,
      fontWeight: '800',
    },
    paymentButtonTextActive: {
      color: theme.textOnPrimary,
    },
    resultsHeader: {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 12,
      marginBottom: 12,
    },
    resultsHeaderActions: {
      width: '100%',
      alignItems: 'stretch',
      gap: 10,
    },
    exportButtonsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'flex-start',
    },
    resultsTitle: {
      color: theme.textPrimary,
      fontSize: 18,
      fontWeight: '900',
    },
    resultsSubtitle: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    resultsBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      alignSelf: 'flex-start',
      maxWidth: '100%',
    },
    exportButton: {
      minHeight: 40,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 8,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: hexToRgba(theme.primary, 0.4),
      alignItems: 'center',
      justifyContent: 'center',
    },
    exportButtonGhost: {
      borderColor: theme.border,
    },
    exportButtonText: {
      color: theme.textSecondary,
      fontSize: 11,
      fontWeight: '800',
    },
    resultsBadgeText: {
      color: theme.primary,
      fontSize: 11,
      fontWeight: '800',
      flexShrink: 1,
    },
    tableCard: {
      backgroundColor: theme.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      marginBottom: 10,
    },
    tableHeaderRow: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceAlt,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    tableHeaderCell: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      justifyContent: 'center',
    },
    tableHeaderText: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      minHeight: 62,
      backgroundColor: theme.card,
    },
    tableRowAlt: {
      backgroundColor: theme.surfaceAlt,
    },
    tableCell: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      justifyContent: 'center',
    },
    tableCellPrice: {
      alignItems: 'flex-end',
    },
    tableCellText: {
      color: theme.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    tableCellTextStrong: {
      color: theme.textPrimary,
      fontWeight: '600',
    },
    paymentBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    paymentBadgeCash: {
      backgroundColor: 'rgba(91, 227, 139, 0.10)',
      borderColor: 'rgba(91, 227, 139, 0.18)',
    },
    paymentBadgeTransfer: {
      backgroundColor: hexToRgba(theme.primary, 0.12),
      borderColor: hexToRgba(theme.primary, 0.24),
    },
    paymentBadgeText: {
      fontSize: 8,
      fontWeight: '600',
    },
    paymentBadgeTextCash: {
      color: '#5BE38B',
    },
    paymentBadgeTextTransfer: {
      color: theme.primary,
    },
    priceText: {
      color: '#F7A047',
      fontSize: 13,
      fontWeight: '900',
    },
    emptyState: {
      backgroundColor: theme.card,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 22,
      alignItems: 'center',
      marginTop: 10,
    },
    emptyTitle: {
      color: theme.textPrimary,
      fontSize: 16,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyText: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 290,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: 'flex-end',
      padding: 16,
    },
    modalCard: {
      backgroundColor: theme.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.border,
      maxHeight: '72%',
      padding: 16,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    modalTitle: {
      color: theme.textPrimary,
      fontSize: 17,
      fontWeight: '800',
    },
    modalClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalList: {
      paddingBottom: 10,
    },
    modalOption: {
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalOptionText: {
      color: theme.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
  });

export default CustomerHistoryScreen;
