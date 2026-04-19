// Free / generic mailbox providers. If a contact's email is on one of these,
// we can't assume the email domain is their employer — enrichment has to find
// the company some other way (LinkedIn, news, etc).
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.fr",
  "yahoo.de",
  "ymail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "live.com",
  "msn.com",
  "outlook.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "gmx.de",
  "yandex.com",
  "yandex.ru",
  "mail.com",
  "fastmail.com",
  "fastmail.fm",
  "tutanota.com",
  "tutanota.de",
  "zoho.com",
  "qq.com",
  "163.com",
  "126.com",
]);

export function isGenericEmailDomain(domain: string): boolean {
  return GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

export function domainFromEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(at + 1);
}

// Returns the domain only if it looks like a corporate domain (not gmail etc).
// Enrichment may later attach a company to a contact on a generic domain.
export function companyDomainFromEmail(email: string): string | null {
  const d = domainFromEmail(email);
  if (!d) return null;
  return isGenericEmailDomain(d) ? null : d;
}
