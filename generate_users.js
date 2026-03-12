const bcrypt = require('bcryptjs');
const fs = require('fs');

async function generate() {
    const password = '123';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const users = [
        { email: 'superadmin@gmail.com', name: 'Super Admin', role: 'SUPER_ADMIN', tenantId: 'NULL' },
        { email: 'admin@gmail.com', name: 'Branch Admin', role: 'BRANCH_ADMIN', tenantId: 1 },
        { email: 'manager@gmail.com', name: 'Gym Manager', role: 'MANAGER', tenantId: 1 },
        { email: 'staff@gmail.com', name: 'Gym Staff', role: 'STAFF', tenantId: 1 },
        { email: 'trainer@gmail.com', name: 'Gym Trainer', role: 'TRAINER', tenantId: 1 },
        { email: 'member@gmail.com', name: 'Gym Member', role: 'MEMBER', tenantId: 1 }
    ];

    let sql = '\n--\n-- Dumping data for table `tenant`\n--\n\n';
    sql += "INSERT INTO `tenant` (`id`, `name`, `status`, `createdAt`, `updatedAt`) VALUES (1, 'Default Gym', 'Active', NOW(), NOW());\n\n";

    sql += '--\n-- Dumping data for table `user`\n--\n\n';
    sql += 'INSERT INTO `user` (`id`, `email`, `password`, `name`, `role`, `status`, `tenantId`, `joinedDate`) VALUES\n';

    const values = users.map((u, i) => 
        `(${i + 1}, '${u.email}', '${hash}', '${u.name}', '${u.role}', 'Active', ${u.tenantId}, NOW())`
    ).join(',\n');

    sql += values + ';\n';

    const filePath = 'c:\\Users\\kiaan\\Desktop\\Kiaan\\Gym New\\gym_new_db.sql';
    fs.appendFileSync(filePath, sql);

    console.log('Seed users added to SQL file successfully.');
}

generate();
