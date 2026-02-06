interface PriceDisplayProps {
  price: number | null;
  affiliateUrl?: string | null;
}

function ExternalLinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="inline-block w-3 h-3 ml-1 opacity-60"
      aria-hidden="true"
    >
      <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
      <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
    </svg>
  );
}

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

export default function PriceDisplay({ price, affiliateUrl }: PriceDisplayProps) {
  if (price === null) {
    return (
      <span className="text-surface-500 dark:text-surface-400 text-sm italic">
        Price N/A
      </span>
    );
  }

  const formatted = formatPrice(price);

  if (affiliateUrl) {
    return (
      <a
        href={affiliateUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-400 hover:text-primary-300 font-semibold transition-colors"
      >
        {formatted}
        <ExternalLinkIcon />
      </a>
    );
  }

  return (
    <span className="text-surface-100 dark:text-surface-100 font-semibold">
      {formatted}
    </span>
  );
}
