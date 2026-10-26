export type CurrencyInfo = {
  code: string;
  /** ISO 4217 minor units: 2 for AUD (cents), 0 for JPY. */
  minorUnits: number;
  /** Symbol shown before amounts. Follows the ledger currency, never the UI language. */
  symbol: string;
  nameEn: string;
  nameZh: string;
};
