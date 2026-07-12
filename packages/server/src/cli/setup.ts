import { getSetupStatus, initializeSetup, previewSetup } from '../initialization/index.js';
import { isSetupError } from '../initialization/errors.js';
import { prisma } from '../db/client.js';
import { resolveDatasetDir } from '../initialization/paths.js';

async function main() {
  const command = process.argv[2] ?? 'preview';
  const datasetDir = process.env.FHM_DATASET_DIR;

  console.log(`Dataset dir: ${resolveDatasetDir(datasetDir)}`);

  try {
    if (command === 'status') {
      const status = await getSetupStatus(prisma, datasetDir);
      console.log(JSON.stringify(status, null, 2));
      process.exit(0);
    }

    if (command === 'validate' || command === 'preview') {
      const preview = await previewSetup(prisma, datasetDir);
      console.log(JSON.stringify(preview, null, 2));
      process.exit(preview.valid ? 0 : 1);
    }

    if (command === 'initialize') {
      const result = await initializeSetup(prisma, datasetDir, {
        log: (msg, meta) => console.log(msg, meta ?? ''),
      });
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    console.error(`Unknown command: ${command}. Use status | validate | preview | initialize`);
    process.exit(2);
  } catch (err) {
    if (isSetupError(err)) {
      console.error(JSON.stringify({ error: err.code, message: err.message, details: err.details }, null, 2));
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
