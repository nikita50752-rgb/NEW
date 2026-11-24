import { writeFileSync } from 'node:fs';
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = function (s) {
  if (s.includes('MISTRAL_API_KEY')) process.stdout.write(s);
  else process.stdout.write('*');
};
rl.question('Вставьте ваш MISTRAL_API_KEY (с https://console.mistral.ai/api-keys): ', (answer) => {
  rl.close();
  const key = answer.trim();
  if (!key) {
    console.error('Ключ пустой. Создайте ключ в консоли Mistral и попробуйте снова.');
    process.exit(1);
  }
  writeFileSync('.env', `MISTRAL_API_KEY=${key}\n`, 'utf8');
  console.log('Готово: ключ записан в .env (файл добавлен в .gitignore, в git не попадёт).');
});
