const normalizePolicyText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const parseCsvValues = (value: string | undefined): string[] =>
  String(value ?? '')
    .split(',')
    .map((entry) => normalizePolicyText(entry))
    .filter((entry) => entry.length > 0);

const defaultViewerCategoryLabels = [
  'sgc iso 15189',
  'iso 15189',
  'sistema de gestion de calidad',
  'sistema de gestion de calidad iso 15189',
];

const defaultViewerCategoryKeywords = [
  'iso 15189',
  '15189',
  'sgc',
  'sistema de gestion de calidad',
  'gestion de calidad',
];

const configuredLabels = parseCsvValues(process.env.VIEWER_ALLOWED_CATEGORY_LABELS);
const configuredKeywords = parseCsvValues(process.env.VIEWER_ALLOWED_CATEGORY_KEYWORDS);

const allowedLabels =
  configuredLabels.length > 0 ? configuredLabels : defaultViewerCategoryLabels.map(normalizePolicyText);

const allowedKeywords =
  configuredKeywords.length > 0
    ? configuredKeywords
    : defaultViewerCategoryKeywords.map(normalizePolicyText);

export const getViewerAllowedCategoryPolicy = () => ({
  labels: [...allowedLabels],
  keywords: [...allowedKeywords],
});

export const isViewerProtectedCategoryName = (categoryName: string | null | undefined): boolean => {
  const normalizedName = normalizePolicyText(String(categoryName ?? ''));
  if (!normalizedName) {
    return false;
  }

  if (allowedLabels.includes(normalizedName)) {
    return true;
  }

  return allowedKeywords.some((keyword) => normalizedName.includes(keyword));
};
