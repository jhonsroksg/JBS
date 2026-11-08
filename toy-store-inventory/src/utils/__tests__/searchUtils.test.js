import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  sanitizeSearchTerm, 
  findMatchingCategoryIds, 
  buildSearchOrClause, 
  matchesProductSearch 
} from '../searchUtils.js';

describe('Suite de Pruebas: Búsqueda Pública Segura y Multi-Campo (JOA Baby Shop)', () => {

  const mockCategories = [
    { id: 'cat-alimentacion', name: 'Alimentación' },
    { id: 'cat-cucharas', name: 'Cucharas' },
    { id: 'cat-juguetes', name: 'Juguetes Educativos' },
    { id: 'cat-ropa', name: 'Ropita de Bebé' }
  ];

  const mockProducts = [
    {
      id: 'p1',
      name: 'Cucharas de silicona suaves',
      sku: 'CAJ#22-4',
      brand: 'Munchkin',
      categoryId: 'cat-cucharas',
      section: 'BEBÉ',
      sellingPrice: 380,
      stock: 5
    },
    {
      id: 'p2',
      name: 'Set de tazas antiderrames',
      sku: 'MCH-09',
      brand: 'Munchkin',
      categoryId: 'cat-alimentacion',
      section: 'BEBÉ',
      sellingPrice: 250,
      stock: 3
    },
    {
      id: 'p3',
      name: 'Torre de aprendizaje Montessori',
      sku: 'TORRE-01',
      brand: 'Joa Baby Shop',
      categoryId: 'cat-juguetes',
      section: 'BEBÉ',
      sellingPrice: 1500,
      stock: 2
    },
    {
      id: 'p4',
      name: 'Termo térmico para café',
      sku: 'PAP-01',
      brand: 'Stanley',
      categoryId: 'cat-alimentacion',
      section: 'PAPÁ',
      sellingPrice: 850,
      stock: 4
    }
  ];

  describe('1. Sanitización de Términos para PostgREST (sanitizeSearchTerm)', () => {
    it('1.1 Limpia caracteres de control como paréntesis y comas', () => {
      const sanitized = sanitizeSearchTerm('Munchkin, Inc. (Pack de 2)');
      assert.strictEqual(sanitized, 'Munchkin Inc Pack de 2');
    });

    it('1.2 Elimina comillas, barras y operadores SQL LIKE', () => {
      const sanitized = sanitizeSearchTerm('"Cucharas" \\ %100%');
      assert.strictEqual(sanitized, 'Cucharas 100');
    });

    it('1.3 Normaliza espacios múltiples y trims', () => {
      const sanitized = sanitizeSearchTerm('   chupón   de   bebé   ');
      assert.strictEqual(sanitized, 'chupón de bebé');
    });

    it('1.4 Maneja cadenas vacías o solo caracteres especiales sin romper', () => {
      assert.strictEqual(sanitizeSearchTerm(',,,()""'), '');
      assert.strictEqual(sanitizeSearchTerm(null), '');
      assert.strictEqual(sanitizeSearchTerm(undefined), '');
    });
  });

  describe('2. Búsqueda de Categorías por Nombre (findMatchingCategoryIds)', () => {
    it('2.1 Localiza categoría exacta', () => {
      const ids = findMatchingCategoryIds('cucharas', mockCategories);
      assert.deepStrictEqual(ids, ['cat-cucharas']);
    });

    it('2.2 Localiza categoría por coincidencia parcial insensible a mayúsculas', () => {
      const ids = findMatchingCategoryIds('alimen', mockCategories);
      assert.deepStrictEqual(ids, ['cat-alimentacion']);
    });

    it('2.3 Retorna arreglo vacío si no coincide ninguna categoría', () => {
      const ids = findMatchingCategoryIds('noexiste', mockCategories);
      assert.deepStrictEqual(ids, []);
    });
  });

  describe('3. Generación de Cláusula PostgREST Multi-Campo (buildSearchOrClause)', () => {
    it('3.1 Genera cláusula para name, sku y brand', () => {
      const clause = buildSearchOrClause('Munchkin');
      assert.strictEqual(
        clause,
        'name.ilike.%Munchkin%,sku.ilike.%Munchkin%,brand.ilike.%Munchkin%'
      );
    });

    it('3.2 Incluye categoryId.in(...) cuando hay categorías coincidentes', () => {
      const matchingCats = ['cat-cucharas', 'cat-alimentacion'];
      const clause = buildSearchOrClause('cucharas', matchingCats);
      assert.strictEqual(
        clause,
        'name.ilike.%cucharas%,sku.ilike.%cucharas%,brand.ilike.%cucharas%,categoryId.in.(cat-cucharas,cat-alimentacion)'
      );
    });

    it('3.3 Retorna null si el término es vacío tras sanitizar', () => {
      assert.strictEqual(buildSearchOrClause('   '), null);
      assert.strictEqual(buildSearchOrClause('(),,""'), null);
    });
  });

  describe('4. Búsqueda y Evaluación Multi-Campo en Memoria (matchesProductSearch)', () => {
    it('4.1 Buscar por nombre: encuentra producto por coincidencia en name', () => {
      const results = mockProducts.filter(p => matchesProductSearch(p, 'silicona', mockCategories));
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].sku, 'CAJ#22-4');
    });

    it('4.2 Buscar por SKU: encuentra producto exactamente por su código SKU', () => {
      const results = mockProducts.filter(p => matchesProductSearch(p, 'CAJ#22-4', mockCategories));
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].name, 'Cucharas de silicona suaves');
    });

    it('4.3 Buscar por marca: encuentra productos por brand aunque el nombre no contenga la marca', () => {
      // El producto p2 es 'Set de tazas antiderrames', no tiene 'Munchkin' en el título pero sí en brand
      const results = mockProducts.filter(p => matchesProductSearch(p, 'Munchkin', mockCategories));
      assert.strictEqual(results.length, 2);
      assert.ok(results.some(p => p.id === 'p1'));
      assert.ok(results.some(p => p.id === 'p2'));
    });

    it('4.4 Buscar escribiendo el nombre de una categoría: encuentra productos de esa categoría', () => {
      // 'Alimentación' coincide con cat-alimentacion (productos p2 y p4)
      const results = mockProducts.filter(p => matchesProductSearch(p, 'Alimentación', mockCategories));
      assert.strictEqual(results.length, 2);
      assert.ok(results.some(p => p.id === 'p2'));
      assert.ok(results.some(p => p.id === 'p4'));
    });

    it('4.5 Buscar términos sin resultados: devuelve lista vacía sin arrojar error', () => {
      const results = mockProducts.filter(p => matchesProductSearch(p, 'palabra_inexistente_xyz', mockCategories));
      assert.strictEqual(results.length, 0);
    });

    it('4.6 Término vacío o nulo: devuelve todos los productos (sin filtrar)', () => {
      const results = mockProducts.filter(p => matchesProductSearch(p, '', mockCategories));
      assert.strictEqual(results.length, mockProducts.length);
    });
  });

  describe('5. Selección de Categorías y Sugerencias', () => {
    it('5.1 Selección de categoría (clic o Enter): transmite el ID de categoría y limpia término de texto', () => {
      const suggestion = { type: 'category', id: 'cat-cucharas', text: 'Cucharas', sub: 'Ver categoría' };
      
      // Simulación de la función handleSearchSelect de Storefront
      const simulatedUpdates = {};
      const mockUpdateParams = (updates) => Object.assign(simulatedUpdates, updates);

      const handleSearchSelect = (termOrObj, type, id) => {
        if (type === 'category' || (termOrObj && termOrObj.type === 'category')) {
          const categoryId = id || termOrObj.id;
          mockUpdateParams({ cat: categoryId, q: null });
          return;
        }
        mockUpdateParams({ q: termOrObj });
      };

      // Simular selección desde sugerencias
      handleSearchSelect(suggestion, suggestion.type, suggestion.id);

      assert.strictEqual(simulatedUpdates.cat, 'cat-cucharas');
      assert.strictEqual(simulatedUpdates.q, null); // q se limpia correctamente
    });

    it('5.2 Selección de producto: abre modal por ID sin mantener q en conflicto', () => {
      const suggestion = { type: 'product', id: 'p1', text: 'Cucharas de silicona' };
      const simulatedUpdates = {};
      const mockUpdateParams = (updates) => Object.assign(simulatedUpdates, updates);

      const handleSearchSelect = (termOrObj, type, id) => {
        if (type === 'product' && id) {
          mockUpdateParams({ producto: id, q: null });
          return;
        }
        mockUpdateParams({ q: termOrObj });
      };

      handleSearchSelect(suggestion, suggestion.type, suggestion.id);
      assert.strictEqual(simulatedUpdates.producto, 'p1');
      assert.strictEqual(simulatedUpdates.q, null);
    });
  });

  describe('6. Aislamiento de Secciones (PAPÁ / MAMÁ vs Inicio)', () => {
    it('6.1 En inicio (section=all), productos exclusivos de PAPÁ o MAMÁ quedan excluidos', () => {
      // Simular regla de sección en Storefront:
      // Inicio (section='all') -> Solo permite 'BEBÉ' y 'TODOS'
      const searchResults = mockProducts.filter(p => matchesProductSearch(p, 'Alimentación', mockCategories));
      // searchResults contiene p2 (BEBÉ) y p4 (PAPÁ)
      
      const homeResults = searchResults.filter(p => ['BEBÉ', 'TODOS'].includes(p.section));
      assert.strictEqual(homeResults.length, 1);
      assert.strictEqual(homeResults[0].id, 'p2'); // Solo el de BEBÉ
      assert.ok(!homeResults.some(p => p.section === 'PAPÁ')); // PAPÁ nunca se filtra al home
    });

    it('6.2 En sección PAPÁ (section=PAPÁ), filtra productos propios de la sección', () => {
      const searchResults = mockProducts.filter(p => matchesProductSearch(p, 'Alimentación', mockCategories));
      const papaResults = searchResults.filter(p => p.section === 'PAPÁ');
      assert.strictEqual(papaResults.length, 1);
      assert.strictEqual(papaResults[0].id, 'p4');
    });
  });
});

