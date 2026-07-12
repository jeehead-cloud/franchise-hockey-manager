import { prisma } from '../db/client.js';
import { bootstrapBalanceConfiguration } from '../services/balance-config.js';

async function main() {
  try {
    const result = await bootstrapBalanceConfiguration(prisma);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
