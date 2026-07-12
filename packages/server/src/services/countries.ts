import { prisma } from '../db/client.js';
import { mapCountry } from '../mappers.js';

export async function listCountries() {
  const rows = await prisma.country.findMany({ orderBy: { name: 'asc' } });
  return rows.map(mapCountry);
}

export async function getCountryById(id: string) {
  const row = await prisma.country.findUnique({ where: { id } });
  return row ? mapCountry(row) : null;
}
