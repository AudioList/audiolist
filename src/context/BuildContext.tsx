import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';
import type { CategoryId, Product, BuildSelection } from '../types';

interface BuildState {
  items: Map<CategoryId, BuildSelection>;
  name: string;
  description: string;
}

type BuildAction =
  | { type: 'SET_PRODUCT'; category: CategoryId; product: Product }
  | { type: 'REMOVE_PRODUCT'; category: CategoryId }
  | { type: 'CLEAR' }
  | { type: 'LOAD'; items: Map<CategoryId, BuildSelection>; name: string; description: string }
  | { type: 'SET_NAME'; name: string }
  | { type: 'SET_DESCRIPTION'; description: string };

function buildReducer(state: BuildState, action: BuildAction): BuildState {
  switch (action.type) {
    case 'SET_PRODUCT': {
      const items = new Map(state.items);
      items.set(action.category, {
        category_id: action.category,
        product: action.product,
        quantity: 1,
      });
      return { ...state, items };
    }
    case 'REMOVE_PRODUCT': {
      const items = new Map(state.items);
      items.delete(action.category);
      return { ...state, items };
    }
    case 'CLEAR':
      return { items: new Map(), name: 'My Audio Build', description: '' };
    case 'LOAD':
      return { items: action.items, name: action.name, description: action.description };
    case 'SET_NAME':
      return { ...state, name: action.name };
    case 'SET_DESCRIPTION':
      return { ...state, description: action.description };
    default:
      return state;
  }
}

interface SerializedBuild {
  items: Record<string, { product: Product; quantity: number }>;
  name?: string;
  description?: string;
}

function serializeBuild(state: BuildState): string {
  const obj: SerializedBuild = { items: {}, name: state.name, description: state.description };
  state.items.forEach((sel, key) => {
    obj.items[key] = { product: sel.product, quantity: sel.quantity };
  });
  return JSON.stringify(obj);
}

function deserializeBuild(json: string): BuildState {
  try {
    const raw = JSON.parse(json);
    const map = new Map<CategoryId, BuildSelection>();

    // Support both old format (flat object) and new format (nested under .items)
    const itemsObj = raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) && raw.items.product === undefined
      ? raw.items as Record<string, { product: Product; quantity: number }>
      : raw as Record<string, { product: Product; quantity: number }>;

    for (const [key, val] of Object.entries(itemsObj)) {
      if (val && typeof val === 'object' && 'product' in val) {
        map.set(key as CategoryId, {
          category_id: key as CategoryId,
          product: val.product,
          quantity: val.quantity,
        });
      }
    }

    return {
      items: map,
      name: typeof raw.name === 'string' ? raw.name : 'My Audio Build',
      description: typeof raw.description === 'string' ? raw.description : '',
    };
  } catch {
    return { items: new Map(), name: 'My Audio Build', description: '' };
  }
}

interface BuildContextValue {
  items: Map<CategoryId, BuildSelection>;
  totalPrice: number;
  itemCount: number;
  name: string;
  description: string;
  setProduct: (category: CategoryId, product: Product) => void;
  removeProduct: (category: CategoryId) => void;
  clearBuild: () => void;
  getSelection: (category: CategoryId) => BuildSelection | undefined;
  setName: (name: string) => void;
  setDescription: (description: string) => void;
}

const BuildContext = createContext<BuildContextValue | null>(null);

export function BuildProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(buildReducer, undefined, () => {
    const stored = localStorage.getItem('audiolist_build');
    if (stored) {
      return deserializeBuild(stored);
    }
    return { items: new Map(), name: 'My Audio Build', description: '' } as BuildState;
  });

  useEffect(() => {
    localStorage.setItem('audiolist_build', serializeBuild(state));
  }, [state]);

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

  const setName = useCallback((name: string) => {
    dispatch({ type: 'SET_NAME', name });
  }, []);

  const setDescription = useCallback((description: string) => {
    dispatch({ type: 'SET_DESCRIPTION', description });
  }, []);

  return (
    <BuildContext.Provider
      value={{
        items: state.items,
        totalPrice,
        itemCount: state.items.size,
        name: state.name,
        description: state.description,
        setProduct,
        removeProduct,
        clearBuild,
        getSelection,
        setName,
        setDescription,
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
