import { test, expect } from '@playwright/test';

const viewports = [
  { width: 320, height: 568, name: 'iPhone SE' },
  { width: 360, height: 800, name: 'Android Small' },
  { width: 375, height: 667, name: 'iPhone 8' },
  { width: 390, height: 844, name: 'iPhone 12/13' },
  { width: 412, height: 915, name: 'Pixel 7' },
  { width: 430, height: 932, name: 'iPhone 14 Pro Max' },
  { width: 768, height: 1024, name: 'iPad Mini' },
  { width: 1024, height: 768, name: 'iPad Landscape' },
  { width: 1440, height: 900, name: 'Desktop' }
];

test.describe('Auditoría Visual y Detección de Overflow', () => {
  viewports.forEach((vp) => {
    test(`Comprobación en ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      // 1. Configurar viewport
      await page.setViewportSize({ width: vp.width, height: vp.height });
      
      // Asegurar que estamos navegando a la URL local correcta
      // Ejecutar "npm run dev" antes de lanzar los tests
      await page.goto('http://localhost:5173/'); 
      await page.waitForLoadState('networkidle');

      // 2. Detección de Overflow Horizontal
      const overflows = await page.evaluate(() => {
        const docWidth = document.documentElement.offsetWidth;
        const bodyWidth = document.body.offsetWidth;
        const clientWidth = Math.min(docWidth, bodyWidth);
        const elements = document.querySelectorAll('*');
        const overflowingElements = [];

        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          // Ignorar elementos ocultos o de ancho 0
          if (rect.width > 0 && rect.height > 0) {
            // Si el borde derecho del elemento excede el viewport de forma significativa
            if (rect.right > clientWidth + 1 && rect.width > clientWidth) {
              overflowingElements.push({
                tag: el.tagName,
                class: el.className,
                width: rect.width,
                right: rect.right,
                viewport: clientWidth
              });
            }
          }
        });
        return overflowingElements;
      });

      // El test fallará si encuentra elementos con overflow
      expect(overflows.length, `Overflow horizontal detectado en ${vp.name}: \n${JSON.stringify(overflows, null, 2)}`).toBe(0);

      // 3. Evaluar Área Táctil Mínima (44x44)
      const smallTouchTargets = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]');
        let smallCount = 0;
        buttons.forEach(btn => {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const style = window.getComputedStyle(btn);
            // Ignorar enlaces en línea (textos)
            if (style.display !== 'inline' && style.display !== 'inline-block') {
              if (rect.width < 44 || rect.height < 44) {
                smallCount++;
              }
            }
          }
        });
        return smallCount;
      });

      // Advertencia en consola (podría convertirse en un expect() estricto)
      if (smallTouchTargets > 0) {
        console.warn(`[Advertencia] ${vp.name}: Se encontraron ${smallTouchTargets} áreas táctiles menores a 44x44px.`);
      }

      // 4. Evaluar tamaño de fuente mínimo en Inputs (para evitar iOS zoom)
      const smallInputs = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), select, textarea');
        let invalidCount = 0;
        inputs.forEach(input => {
          const style = window.getComputedStyle(input);
          const fontSize = parseFloat(style.fontSize);
          if (fontSize < 16) {
            invalidCount++;
          }
        });
        return invalidCount;
      });
      
      expect(smallInputs, `Se encontraron ${smallInputs} inputs con tamaño de fuente menor a 16px en ${vp.name}`).toBe(0);

    });
  });
});
