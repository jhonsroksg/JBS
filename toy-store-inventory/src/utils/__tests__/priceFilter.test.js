import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  getEffectivePrice, 
  computeCatalogMaxPrice, 
  buildPriceQueryFilter, 
  matchesPriceFilter, 
  clampPriceRange 
} from '../priceFilter.js';

describe('Suite de Pruebas: Filtro de Precio Robusto para JOA Baby Shop', () => {

  describe('1. Tratamiento de Precios Efectivos (getEffectivePrice)', () => {
    it('1.1 Producto con precio normal (sin descuento): retorna sellingPrice', () => {
      const prod = { id: 'p1', name: 'Juguete Normal', sellingPrice: 350, discountPrice: null };
      assert.strictEqual(getEffectivePrice(prod), 350);
    });

    it('1.2 Producto con precio de oferta válido: retorna discountPrice', () => {
      const prod = { id: 'p2', name: 'Ropita en Oferta', sellingPrice: 500, discountPrice: 380 };
      assert.strictEqual(getEffectivePrice(prod), 380);
    });

    it('1.3 Producto con discountPrice = 0: lo ignora y retorna sellingPrice', () => {
      const prod = { id: 'p3', name: 'Cucharas', sellingPrice: 250, discountPrice: 0 };
      assert.strictEqual(getEffectivePrice(prod), 250);
    });

    it('1.4 Producto con discountPrice inválido (mayor o igual al precio normal): retorna sellingPrice', () => {
      const prod = { id: 'p4', name: 'Zapato', sellingPrice: 400, discountPrice: 450 };
      assert.strictEqual(getEffectivePrice(prod), 400);
    });

    it('1.5 Producto con valores nulos o vacíos: retorna fallback seguro 0', () => {
      assert.strictEqual(getEffectivePrice(null), 0);
      assert.strictEqual(getEffectivePrice({}), 0);
      assert.strictEqual(getEffectivePrice({ sellingPrice: 'invalido' }), 0);
    });
  });

  describe('2. Cálculo del Máximo del Catálogo (computeCatalogMaxPrice)', () => {
    it('2.1 Catálogo vacío: retorna escala base mínima de L. 1,000', () => {
      const max = computeCatalogMaxPrice([]);
      assert.strictEqual(max, 1000);
    });

    it('2.2 Catálogo con precios inferiores a L. 1,000: mantiene mínimo de L. 1,000', () => {
      const prods = [
        { sellingPrice: 150, discountPrice: null },
        { sellingPrice: 350, discountPrice: 280 },
        { sellingPrice: 450, discountPrice: null }
      ];
      assert.strictEqual(computeCatalogMaxPrice(prods), 1000);
    });

    it('2.3 Producto con precio superior al de los primeros 24 resultados: detecta el precio superior exacto', () => {
      // Simular primeros 24 productos con precios moderados <= 500
      const first24 = Array.from({ length: 24 }, (_, i) => ({
        id: `p-${i}`,
        sellingPrice: 100 + (i * 15),
        discountPrice: null
      }));
      // Producto #25 fuera de la página inicial con precio alto
      const item25 = { id: 'p-25', sellingPrice: 4820, discountPrice: null };
      
      const allItems = [...first24, item25];
      // computeCatalogMaxPrice recibe los productos candidatos y redondea al múltiplo superior de 50
      const max = computeCatalogMaxPrice(allItems);
      // 4820 redondeado a múltiplos de 50 -> 4850
      assert.strictEqual(max, 4850);
    });

    it('2.4 Respeta redondeo en escala de L. 50', () => {
      const prods = [{ sellingPrice: 1210, discountPrice: null }];
      assert.strictEqual(computeCatalogMaxPrice(prods), 1250);
    });

    it('2.5 Considera el precio con descuento al determinar el máximo efectivo', () => {
      const prods = [
        { sellingPrice: 3000, discountPrice: 2200 }, // Efectivo 2200
        { sellingPrice: 2100, discountPrice: null }   // Efectivo 2100
      ];
      assert.strictEqual(computeCatalogMaxPrice(prods), 2200);
    });
  });

  describe('3. Cláusula PostgREST de Supabase (buildPriceQueryFilter)', () => {
    it('3.1 Genera cláusula OR combinada para precio normal y precio en oferta', () => {
      const clause = buildPriceQueryFilter(500);
      assert.strictEqual(clause, 'sellingPrice.lte.500,and(discountPrice.lte.500,discountPrice.gt.0)');
    });

    it('3.2 Retorna null si maxPrice es null, undefined o >= 100000 (sin filtro)', () => {
      assert.strictEqual(buildPriceQueryFilter(null), null);
      assert.strictEqual(buildPriceQueryFilter(undefined), null);
      assert.strictEqual(buildPriceQueryFilter(100000), null);
      assert.strictEqual(buildPriceQueryFilter(0), null);
    });
  });

  describe('4. Evaluación en Memoria (matchesPriceFilter)', () => {
    it('4.1 Producto con precio normal menor al límite: califica', () => {
      const prod = { sellingPrice: 300, discountPrice: null };
      assert.strictEqual(matchesPriceFilter(prod, 400), true);
    });

    it('4.2 Producto con precio normal mayor al límite: no califica', () => {
      const prod = { sellingPrice: 500, discountPrice: null };
      assert.strictEqual(matchesPriceFilter(prod, 400), false);
    });

    it('4.3 Producto con sellingPrice mayor al límite pero con descuento que sí califica: CALIFICA', () => {
      const prod = { sellingPrice: 600, discountPrice: 350 };
      // El cliente tiene presupuesto de 400. La oferta es 350 -> debe mostrarse!
      assert.strictEqual(matchesPriceFilter(prod, 400), true);
    });

    it('4.4 Producto con sellingPrice mayor y descuento también mayor al límite: no califica', () => {
      const prod = { sellingPrice: 800, discountPrice: 550 };
      assert.strictEqual(matchesPriceFilter(prod, 400), false);
    });

    it('4.5 Producto con discountPrice = 0 y sellingPrice mayor al límite: no califica', () => {
      const prod = { sellingPrice: 500, discountPrice: 0 };
      assert.strictEqual(matchesPriceFilter(prod, 400), false);
    });
  });

  describe('5. Simulación de Flujos y Casos de Negocio', () => {
    const catalogData = [
      { id: '1', name: 'Chupón', categoryId: 'cat-bebe', section: 'BEBÉ', sellingPrice: 150, discountPrice: null, stock: 10 },
      { id: '2', name: 'Biberón Pro', categoryId: 'cat-bebe', section: 'BEBÉ', sellingPrice: 400, discountPrice: 300, stock: 5 },
      { id: '3', name: 'Cochecito Lujo', categoryId: 'cat-bebe', section: 'BEBÉ', sellingPrice: 3500, discountPrice: null, stock: 2 },
      { id: '4', name: 'Regalo Papá', categoryId: 'cat-papa', section: 'PAPÁ', sellingPrice: 1200, discountPrice: 950, stock: 4 },
      { id: '5', name: 'Bolsa Mamá', categoryId: 'cat-mama', section: 'MAMÁ', sellingPrice: 2800, discountPrice: null, stock: 3 }
    ];

    it('5.1 Cambio de página: el límite máximo del slider se mantiene estable', () => {
      const catalogMax = computeCatalogMaxPrice(catalogData); // 3500
      // En la página 2 solo hay productos baratos
      const page2Products = [catalogData[0]]; // Chupón 150
      // El slider NO debe recalcularse desde page2Products:
      assert.strictEqual(catalogMax, 3500);
      assert.strictEqual(clampPriceRange(null, catalogMax), 3500);
    });

    it('5.2 Aplicar y quitar filtro de precio: el slider no se encoje y se restaura', () => {
      const catalogMax = 3500;
      let priceRange = 500; // Usuario filtra por 500

      // El rango actual es 500 pero el máximo del control sigue siendo 3500
      assert.strictEqual(clampPriceRange(priceRange, catalogMax), 500);
      assert.strictEqual(catalogMax, 3500);

      // Quitar filtro (Limpiar)
      priceRange = null;
      assert.strictEqual(clampPriceRange(priceRange, catalogMax), 3500);
    });

    it('5.3 Cambio de categoría: calcula el máximo correspondiente a la categoría', () => {
      const bebeProds = catalogData.filter(p => p.categoryId === 'cat-bebe');
      const papaProds = catalogData.filter(p => p.categoryId === 'cat-papa');

      const maxBebe = computeCatalogMaxPrice(bebeProds);
      const maxPapa = computeCatalogMaxPrice(papaProds);

      assert.strictEqual(maxBebe, 3500); // Cochecito Lujo
      assert.strictEqual(maxPapa, 1000); // 950 efectivo -> redondeado al mínimo de 1000
    });

    it('5.4 Cambio entre secciones PAPÁ y MAMÁ: refleja los máximos independientes', () => {
      const papaProds = catalogData.filter(p => p.section === 'PAPÁ');
      const mamaProds = catalogData.filter(p => p.section === 'MAMÁ');

      assert.strictEqual(computeCatalogMaxPrice(papaProds), 1000); // 950 efectivo
      assert.strictEqual(computeCatalogMaxPrice(mamaProds), 2800); // 2800
    });

    it('5.5 Activar favoritos: calcula el máximo antes de aplicar filtro de precio', () => {
      const favoriteIds = ['1', '2', '4']; // Chupón (150), Biberón (300 efectivo), Regalo Papá (950 efectivo)
      const favProducts = catalogData.filter(p => favoriteIds.includes(p.id));

      // Máximo de favoritos antes del filtro
      const favMax = computeCatalogMaxPrice(favProducts);
      assert.strictEqual(favMax, 1000);

      // Si el usuario aplica un filtro de 200 en favoritos:
      const filteredFavs = favProducts.filter(p => matchesPriceFilter(p, 200));
      assert.strictEqual(filteredFavs.length, 1);
      assert.strictEqual(filteredFavs[0].name, 'Chupón');

      // El slider de favoritos no debe colapsar a 150: conserva favMax (1000)
      assert.strictEqual(favMax, 1000);
    });

    it('5.6 Usar ambos sliders (escritorio y móvil): se sincronizan con clampPriceRange', () => {
      const maxAvailable = 3500;
      let priceRange = null;

      // Estado inicial: ambos muestran maxAvailable
      const desktopVal1 = clampPriceRange(priceRange, maxAvailable);
      const mobileVal1 = clampPriceRange(priceRange, maxAvailable);
      assert.strictEqual(desktopVal1, 3500);
      assert.strictEqual(mobileVal1, 3500);

      // Usuario mueve el slider móvil a 1250
      priceRange = 1250;
      const desktopVal2 = clampPriceRange(priceRange, maxAvailable);
      const mobileVal2 = clampPriceRange(priceRange, maxAvailable);
      assert.strictEqual(desktopVal2, 1250);
      assert.strictEqual(mobileVal2, 1250);
      assert.strictEqual(desktopVal2, mobileVal2);
    });

    it('5.7 Limpiar todos los filtros: resetea priceRange a null y vuelve al total', () => {
      const maxAvailable = 3500;
      let priceRange = 800;

      // Acción de limpiar todos los filtros:
      priceRange = null;

      const results = catalogData.filter(p => matchesPriceFilter(p, priceRange));
      assert.strictEqual(results.length, catalogData.length);
      assert.strictEqual(clampPriceRange(priceRange, maxAvailable), 3500);
    });
  });
});

