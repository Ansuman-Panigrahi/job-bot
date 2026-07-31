import fs from 'node:fs/promises';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'data', 'jobs.db');

async function cleanDatabase() {
    try {
        await fs.access(dbPath);
        await fs.unlink(dbPath);

        console.log('🗑️ Database deleted successfully.');
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log('ℹ️ Database does not exist.');
            return;
        }

        console.error('❌ Failed to delete database.');
        console.error(error);
        process.exit(1);
    }
}

cleanDatabase();