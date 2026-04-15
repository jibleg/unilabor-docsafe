const bcrypt = require('bcrypt');

const passwordToHash = process.argv[2] || 'admin123';
const email = process.argv[3] || 'tu-email@ejemplo.com';
const saltRounds = 10;

bcrypt.hash(passwordToHash, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error generando el hash:', err);
    process.exitCode = 1;
    return;
  }

  console.log('--------------------------------------------------');
  console.log('CONTRASENA ORIGINAL:', passwordToHash);
  console.log('HASH PARA TU BASE DE DATOS:', hash);
  console.log('--------------------------------------------------');
  console.log('\nCopia el HASH y ejecutalo en tu SQL:');
  console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = '${email}';`);
});
