import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Actualización atómica de parámetros de URL (Race Condition Fix)', () => {
  test('Llamadas consecutivas en el mismo render cycle sobrescriben parámetros (Race Condition simulada)', () => {
    // Estado inicial congelado del render actual de React
    const reactRenderParams = new URLSearchParams('cat=bebe&fav=true');
    
    let finalParams;
    
    // Llamada 1: setActiveCategory('juguetes') -> updateParams({ cat: 'juguetes' })
    const call1 = () => {
      const newParams = new URLSearchParams(reactRenderParams);
      newParams.set('cat', 'juguetes');
      finalParams = newParams;
    };

    // Llamada 2 (consecutiva): updateParams({ fav: null })
    const call2 = () => {
      // Como reactRenderParams no ha cambiado (sigue siendo cat=bebe&fav=true),
      // al crear el nuevo objeto usando el estado viejo, sobreescribe los cambios de call1.
      const newParams = new URLSearchParams(reactRenderParams);
      newParams.delete('fav');
      finalParams = newParams; 
    };

    call1();
    call2();

    // Comprobamos la falla: el parámetro cat volvió a su estado inicial, 'juguetes' se perdió.
    assert.strictEqual(finalParams.get('cat'), 'bebe');
    assert.strictEqual(finalParams.has('fav'), false);
  });

  test('Llamada atómica consolida ambos cambios de forma exitosa', () => {
    const reactRenderParams = new URLSearchParams('cat=bebe&fav=true');
    
    let finalParams;

    // Llamada atómica: updateParams({ cat: 'juguetes', fav: null })
    const atomicCall = () => {
      const newParams = new URLSearchParams(reactRenderParams);
      
      const updates = { cat: 'juguetes', fav: null };
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) newParams.delete(key);
        else newParams.set(key, value);
      });
      
      finalParams = newParams;
    };

    atomicCall();

    // Comprobamos el éxito: se cambió cat a juguetes Y se eliminó fav correctamente.
    assert.strictEqual(finalParams.get('cat'), 'juguetes');
    assert.strictEqual(finalParams.has('fav'), false);
  });
});
