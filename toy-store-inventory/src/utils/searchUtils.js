/**
 * Utilidades para búsqueda segura y consistente en JOA BABY SHOP.
 * Soporta búsqueda multi-campo (nombre, SKU, marca y categoría)
 * y previene errores de sintaxis en consultas PostgREST.
 */

/**
 * Sanitiza un término de búsqueda para consultas seguras en PostgREST.
 * Elimina caracteres de control que rompen filtros .or() (comas, paréntesis, comillas, barras, comodines SQL).
 *
 * @param {string} term
 * @returns {string} Término sanitizado
 */
export const sanitizeSearchTerm = (term) => {
  if (!term || typeof term !== 'string') return '';
  return term
    .replace(/[(),."'\\]/g, ' ')
    .replace(/[%_]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

/**
 * Encuentra IDs de categorías cuyos nombres coincidan con el término de búsqueda.
 *
 * @param {string} term - Término buscado
 * @param {Array} categories - Colección de categorías en caché o memoria
 * @returns {Array<string>} IDs de categorías coincidentes
 */
export const findMatchingCategoryIds = (term, categories = []) => {
  if (!term || !Array.isArray(categories) || categories.length === 0) return [];
  const normalized = term.toLowerCase().trim();
  if (!normalized) return [];

  return categories
    .filter(cat => cat && cat.id && cat.name && cat.name.toLowerCase().includes(normalized))
    .map(cat => cat.id);
};

/**
 * Construye la cláusula PostgREST multi-campo para supabase.from('products').or(...)
 * Buscando en:
 * 1. Nombre (name.ilike)
 * 2. SKU (sku.ilike)
 * 3. Marca (brand.ilike)
 * 4. Categoría por ID (categoryId.in) si el término coincide con el nombre de alguna categoría
 *
 * @param {string} rawTerm - Término de búsqueda
 * @param {Array<string>} matchingCategoryIds - IDs de categorías asociadas
 * @returns {string|null} Cláusula para .or(...) o null si el término es vacío
 */
export const buildSearchOrClause = (rawTerm, matchingCategoryIds = []) => {
  const clean = sanitizeSearchTerm(rawTerm);
  if (!clean) return null;

  const clauses = [
    `name.ilike.%${clean}%`,
    `sku.ilike.%${clean}%`,
    `brand.ilike.%${clean}%`
  ];

  if (Array.isArray(matchingCategoryIds) && matchingCategoryIds.length > 0) {
    const validIds = matchingCategoryIds.filter(id => typeof id === 'string' && id.trim());
    if (validIds.length > 0) {
      clauses.push(`categoryId.in.(${validIds.join(',')})`);
    }
  }

  return clauses.join(',');
};

/**
 * Evalúa en memoria si un producto coincide con el término de búsqueda
 * considerando nombre, SKU, marca y categorías coincidentes.
 *
 * @param {Object} product - Producto a evaluar
 * @param {string} term - Término de búsqueda
 * @param {Array} categories - Categorías para resolver nombres
 * @returns {boolean} True si coincide
 */
export const matchesProductSearch = (product, term, categories = []) => {
  if (!term || !term.trim()) return true;
  if (!product) return false;

  const normalized = term.toLowerCase().trim();

  // 1. Nombre
  if (product.name && product.name.toLowerCase().includes(normalized)) return true;

  // 2. SKU
  if (product.sku && product.sku.toLowerCase().includes(normalized)) return true;

  // 3. Marca
  if (product.brand && product.brand.toLowerCase().includes(normalized)) return true;

  // 4. Categoría por ID coincidente
  if (product.categoryId && Array.isArray(categories)) {
    const matchingIds = findMatchingCategoryIds(normalized, categories);
    if (matchingIds.includes(product.categoryId)) return true;
  }

  return false;
};

