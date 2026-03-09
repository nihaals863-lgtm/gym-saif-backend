const superadminController = require('./controllers/superadmin.controller');

if (typeof superadminController.deleteStaffMember === 'undefined') {
    console.error('ERROR: deleteStaffMember is undefined!');
    process.exit(1);
} else {
    console.log('SUCCESS: deleteStaffMember is defined and exported.');
}
