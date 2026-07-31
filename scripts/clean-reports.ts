import fs from 'node:fs/promises';
import path from 'node:path';

const reportsDir = path.join(process.cwd(), 'reports');

async function cleanReports() {
    try {
        const entries = await fs.readdir(reportsDir);

        let deleted = 0;

        for (const entry of entries) {
            const filePath = path.join(reportsDir, entry);
            const stat = await fs.stat(filePath);

            if (stat.isFile()) {
                await fs.unlink(filePath);
                deleted++;
            }
        }

        console.log(`🗑️ Deleted ${deleted} report(s).`);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log('ℹ️ Reports directory does not exist.');
            return;
        }

        console.error('❌ Failed to clean reports.');
        console.error(error);
        process.exit(1);
    }
}

cleanReports();