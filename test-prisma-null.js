const prisma = require('./src/config/prisma');
async function test() {
    try {
        const branches = await prisma.tenant.findMany({
            where: {
                OR: [
                    { id: null },
                    { owner: "foo@example.com" }
                ]
            }
        });
        console.log("SUCCESS");
    } catch (e) {
        console.log("ERROR", e.message);
    }
}
test();
