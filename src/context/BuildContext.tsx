import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';
import type { CategoryId, Product, BuildSelection } from '../types';

interface BuildState {
  items: Map<CategoryId, BuildSelection>;
}

type BuildAction =
  | { type: 'SET_PRODUCT'; category: CategoryId; product: Product }
  | { type: 'REMOVE_PRODUCT'; category: CategoryId }
  | { type: 'CLEAR' }
  | { type: 'LOAD'; items: Map<CategoryId, BuildSelection> };

function buildReducer(state: BuildState, action: BuildAction): BuildState {
  switch (action.type) {
    case 'SET_PRODUCT': {
      const items = new Map(state.items);
      items.set(action.category, {
        category_id: action.category,
        product: action.product,
        quantity: 1,
      });
      return { items };
    }
    case 'REMOVE_PRODUCT': {
      const items = new Map(state.items);
      items.delete(action.category);
      return { items };
    }
    case 'CLEAR':
      return { items: new Map() };
    case 'LOAD':
      return { items: action.items };
    default:
      return state;
  }
}

function serializeBuild(items: Map<CategoryId, BuildSelection>): string {
  const obj: Record<string, { product: Product; quantity: number }> = {};
  items.forEach((sel, key) => {
    obj[key] = { product: sel.product, quantity: sel.quantity };
  });
  return JSON.stringify(obj);
}

function deserializeBuild(json: string): Map<CategoryId, BuildSelection> {
  try {
    const obj = JSON.parse(json) as Record<string, { product: Product; quantity: number }>;
    const map = new Map<CategoryId, BuildSelection>();
    for (const [key, val] of Object.entries(obj)) {
      map.set(key as CategoryId, {
        category_id: key as CategoryId,
        product: val.product,
        quantity: val.quantity,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

interface BuildContextValue {
  items: Map<CategoryId, BuildSelection>;
  totalPrice: number;
  itemCount: number;
  setProduct: (category: CategoryId, product: Product) => void;
  removeProduct: (category: CategoryId) => void;
  clearBuild: () => void;
  getSelection: (category: CategoryId) => BuildSelection | undefined;
}

const BuildContext = createContext<BuildContextValue | null>(null);

export function BuildProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(buildReducer, { items: new Map() }, () => {
    const stored = localStorage.getItem('audiolist_build');
    if (stored) {
      return { items: deserializeBuild(stored) };
    }
    return { items: new Map() };
  });

  useEffect(() => {
    localStorage.setItem('audiolist_build', serializeBuild(state.items));
  }, [state.items]);

  const totalPrice = Array.from(state.items.values()).reduce((sum, sel) => {
    const price = sel.custom_price ?? sel.product.price;
    return sum + (price ?? 0) * sel.quantity;
  }, 0);

  const setProduct = useCallback((category: CategoryId, product: Product) => {
    dispatch({ type: 'SET_PRODUCT', category, product });
  }, []);

  const removeProduct = useCallback((category: CategoryId) => {
    dispatch({ type: 'REMOVE_PRODUCT', category });
  }, []);

  const clearBuild = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const getSelection = useCallback(
    (category: CategoryId) => state.items.get(category),
    [state.items]
  );

  return (
    <BuildContext.Provider
      value={{
        items: state.items,
        totalPrice,
        itemCount: state.items.size,
        setProduct,
        removeProduct,
        clearBuild,
        getSelection,
      }}
    >
      {children}
    </BuildContext.Provider>
  );
}

export function useBuild(): BuildContextValue {
  const ctx = useContext(BuildContext);
  if (!ctx) throw new Error('useBuild must be used within BuildProvider');
  return ctx;
}
