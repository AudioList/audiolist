import type { CategoryId, BuildSelection } from '../../types';

interface SignalChainVisualizerProps {
  items: Map<CategoryId, BuildSelection>;
}

/** Output categories -- only one is used per build */
const OUTPUT_CATEGORIES: { categoryId: CategoryId; label: string }[] = [
  { categoryId: 'iem', label: 'IEM' },
  { categoryId: 'headphone', label: 'Headphone' },
  { categoryId: 'speaker', label: 'Speaker' },
];

/** Check if a DAC product also functions as an amplifier */
function isDacAmpCombo(selection: BuildSelection | undefined): boolean {
  if (!selection) return false;
  const deviceType = selection.product.asr_device_type;
  if (!deviceType) return false;
  // Matches "DAC+Headphone AMP", "DAC+Speaker AMP", etc.
  return deviceType.toUpperCase().includes('AMP');
}

function ChipIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M14 6H6v8h8V6Z" />
      <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v11.5A2.25 2.25 0 0 1 15.75 18H4.25A2.25 2.25 0 0 1 2 15.75V4.25ZM4.25 3.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h11.5a.75.75 0 0 0 .75-.75V4.25a.75.75 0 0 0-.75-.75H4.25Z" clipRule="evenodd" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
    </svg>
  );
}

function ComboIcon({ className }: { className?: string }) {
  // Combined chip + bolt icon for DAC/Amp combos
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M14 6H6v8h8V6Z" />
      <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v11.5A2.25 2.25 0 0 1 15.75 18H4.25A2.25 2.25 0 0 1 2 15.75V4.25ZM4.25 3.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h11.5a.75.75 0 0 0 .75-.75V4.25a.75.75 0 0 0-.75-.75H4.25Z" clipRule="evenodd" />
    </svg>
  );
}

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 3.75a.75.75 0 0 0-1.264-.546L4.703 7H3.167a.75.75 0 0 0-.7.48A6.985 6.985 0 0 0 2 10c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h1.535l4.033 3.796A.75.75 0 0 0 10 16.25V3.75Z" />
      <path d="M15.95 5.05a.75.75 0 0 0-1.06 1.061 5.5 5.5 0 0 1 0 7.778.75.75 0 0 0 1.06 1.06 7 7 0 0 0 0-9.899Z" />
      <path d="M13.829 7.172a.75.75 0 0 0-1.061 1.06 2.5 2.5 0 0 1 0 3.536.75.75 0 0 0 1.06 1.06 4 4 0 0 0 0-5.656Z" />
    </svg>
  );
}

function SourceIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path fillRule="evenodd" d="M2 4.25A2.25 2.25 0 0 1 4.25 2h11.5A2.25 2.25 0 0 1 18 4.25v8.5A2.25 2.25 0 0 1 15.75 15h-3.105a3.501 3.501 0 0 0 1.1 1.677A.75.75 0 0 1 13.26 18H6.74a.75.75 0 0 1-.484-1.323A3.501 3.501 0 0 0 7.355 15H4.25A2.25 2.25 0 0 1 2 12.75v-8.5Zm1.5 0a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75v-7.5Z" clipRule="evenodd" />
    </svg>
  );
}

function Arrow() {
  return (
    <div className="flex items-center text-surface-400 dark:text-surface-500">
      <svg width="32" height="12" viewBox="0 0 32 12" fill="none" aria-hidden="true">
        <line x1="0" y1="6" x2="26" y2="6" stroke="currentColor" strokeWidth="2" />
        <polygon points="26,1 32,6 26,11" fill="currentColor" />
      </svg>
    </div>
  );
}

function ArrowDown() {
  return (
    <div className="flex justify-center text-surface-400 dark:text-surface-500">
      <svg width="12" height="24" viewBox="0 0 12 24" fill="none" aria-hidden="true">
        <line x1="6" y1="0" x2="6" y2="18" stroke="currentColor" strokeWidth="2" />
        <polygon points="1,18 6,24 11,18" fill="currentColor" />
      </svg>
    </div>
  );
}

interface NodeProps {
  label: string;
  sublabel?: string;
  productName?: string;
  productPrice?: number | null;
  icon: React.ReactNode;
  filled: boolean;
}

function ChainNode({ label, sublabel, productName, productPrice, icon, filled }: NodeProps) {
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-4 py-3 min-w-[100px] max-w-[160px] transition-colors ${
        filled
          ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20'
          : 'border-dashed border-surface-300 bg-surface-50 dark:border-surface-600 dark:bg-surface-800/50'
      }`}
    >
      <div className={`${filled ? 'text-primary-600 dark:text-primary-400' : 'text-surface-400 dark:text-surface-500'}`}>
        {icon}
      </div>
      <span className={`text-xs font-bold ${filled ? 'text-primary-700 dark:text-primary-300' : 'text-surface-500 dark:text-surface-400'}`}>
        {label}
      </span>
      {sublabel && (
        <span className="text-[9px] font-medium text-primary-500 dark:text-primary-500 -mt-1">
          {sublabel}
        </span>
      )}
      {filled && productName ? (
        <>
          <span className="text-[11px] font-medium text-surface-700 dark:text-surface-200 text-center leading-tight line-clamp-2">
            {productName}
          </span>
          {productPrice !== null && productPrice !== undefined && (
            <span className="text-[10px] font-mono text-surface-500 dark:text-surface-400">
              ${productPrice.toFixed(0)}
            </span>
          )}
        </>
      ) : (
        <span className="text-[10px] italic text-surface-400 dark:text-surface-500">
          Not selected
        </span>
      )}
    </div>
  );
}

export default function SignalChainVisualizer({ items }: SignalChainVisualizerProps) {
  // Determine which output is selected
  const output = OUTPUT_CATEGORIES.find((cat) => items.has(cat.categoryId));
  const outputSelection = output ? items.get(output.categoryId) : undefined;

  const dacSelection = items.get('dac');
  const ampSelection = items.get('amp');
  const dacIsCombo = isDacAmpCombo(dacSelection);

  // If the DAC is a combo unit and no separate amp is selected,
  // show a single combined "DAC/Amp" node instead of two separate nodes
  const showComboNode = dacIsCombo && !ampSelection;

  const iconClass = 'h-5 w-5';

  const renderDesktopChain = () => {
    if (showComboNode) {
      // Collapsed: Source -> DAC/Amp -> Output
      return (
        <>
          <ChainNode
            label="Source"
            productName="Phone / PC"
            icon={<SourceIcon className={iconClass} />}
            filled
          />
          <Arrow />
          <ChainNode
            label="DAC/Amp"
            sublabel="combo unit"
            productName={dacSelection?.product.name}
            productPrice={dacSelection?.custom_price ?? dacSelection?.product.price}
            icon={<ComboIcon className={iconClass} />}
            filled={!!dacSelection}
          />
          <Arrow />
          <ChainNode
            label={output?.label ?? 'Output'}
            productName={outputSelection?.product.name}
            productPrice={outputSelection?.custom_price ?? outputSelection?.product.price}
            icon={<SpeakerIcon className={iconClass} />}
            filled={!!outputSelection}
          />
        </>
      );
    }

    // Standard: Source -> DAC -> Amp -> Output
    return (
      <>
        <ChainNode
          label="Source"
          productName="Phone / PC"
          icon={<SourceIcon className={iconClass} />}
          filled
        />
        <Arrow />
        <ChainNode
          label={dacIsCombo ? 'DAC/Amp' : 'DAC'}
          sublabel={dacIsCombo ? 'combo unit' : undefined}
          productName={dacSelection?.product.name}
          productPrice={dacSelection?.custom_price ?? dacSelection?.product.price}
          icon={dacIsCombo ? <ComboIcon className={iconClass} /> : <ChipIcon className={iconClass} />}
          filled={!!dacSelection}
        />
        <Arrow />
        <ChainNode
          label="Amp"
          productName={ampSelection?.product.name}
          productPrice={ampSelection?.custom_price ?? ampSelection?.product.price}
          icon={<BoltIcon className={iconClass} />}
          filled={!!ampSelection}
        />
        <Arrow />
        <ChainNode
          label={output?.label ?? 'Output'}
          productName={outputSelection?.product.name}
          productPrice={outputSelection?.custom_price ?? outputSelection?.product.price}
          icon={<SpeakerIcon className={iconClass} />}
          filled={!!outputSelection}
        />
      </>
    );
  };

  const renderMobileChain = () => {
    if (showComboNode) {
      return (
        <>
          <ChainNode
            label="Source"
            productName="Phone / PC"
            icon={<SourceIcon className={iconClass} />}
            filled
          />
          <ArrowDown />
          <ChainNode
            label="DAC/Amp"
            sublabel="combo unit"
            productName={dacSelection?.product.name}
            productPrice={dacSelection?.custom_price ?? dacSelection?.product.price}
            icon={<ComboIcon className={iconClass} />}
            filled={!!dacSelection}
          />
          <ArrowDown />
          <ChainNode
            label={output?.label ?? 'Output'}
            productName={outputSelection?.product.name}
            productPrice={outputSelection?.custom_price ?? outputSelection?.product.price}
            icon={<SpeakerIcon className={iconClass} />}
            filled={!!outputSelection}
          />
        </>
      );
    }

    return (
      <>
        <ChainNode
          label="Source"
          productName="Phone / PC"
          icon={<SourceIcon className={iconClass} />}
          filled
        />
        <ArrowDown />
        <ChainNode
          label={dacIsCombo ? 'DAC/Amp' : 'DAC'}
          sublabel={dacIsCombo ? 'combo unit' : undefined}
          productName={dacSelection?.product.name}
          productPrice={dacSelection?.custom_price ?? dacSelection?.product.price}
          icon={dacIsCombo ? <ComboIcon className={iconClass} /> : <ChipIcon className={iconClass} />}
          filled={!!dacSelection}
        />
        <ArrowDown />
        <ChainNode
          label="Amp"
          productName={ampSelection?.product.name}
          productPrice={ampSelection?.custom_price ?? ampSelection?.product.price}
          icon={<BoltIcon className={iconClass} />}
          filled={!!ampSelection}
        />
        <ArrowDown />
        <ChainNode
          label={output?.label ?? 'Output'}
          productName={outputSelection?.product.name}
          productPrice={outputSelection?.custom_price ?? outputSelection?.product.price}
          icon={<SpeakerIcon className={iconClass} />}
          filled={!!outputSelection}
        />
      </>
    );
  };

  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
      <h3 className="mb-3 text-sm font-bold text-surface-900 dark:text-surface-100">
        Signal Chain
      </h3>

      {/* Desktop: horizontal flow */}
      <div className="hidden sm:flex items-center justify-center gap-2 overflow-x-auto py-2">
        {renderDesktopChain()}
      </div>

      {/* Mobile: vertical flow */}
      <div className="flex sm:hidden flex-col items-center gap-1 py-2">
        {renderMobileChain()}
      </div>
    </div>
  );
}
