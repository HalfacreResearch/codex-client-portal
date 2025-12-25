import mysql from 'mysql2/promise';
import crypto from 'crypto';
import axios from 'axios';
import fs from 'fs';

const ENCRYPTION_KEY = process.env.JWT_SECRET;

function decrypt(encryptedKey) {
  const [ivHex, authTagHex, encrypted] = encryptedKey.split(':');
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted key format');
  }
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function main() {
  // Get Glenn's encrypted API key from database
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query('SELECT sfoxApiKey FROM client_credentials WHERE userId = 60003');
  await conn.end();
  
  if (!rows[0]) {
    console.error('Glenn not found in database');
    process.exit(1);
  }
  
  const encryptedKey = rows[0].sfoxApiKey;
  const apiKey = decrypt(encryptedKey);
  
  console.log('Fetching Glenn\'s transactions from sFOX...');
  
  // Fetch transactions from sFOX
  const response = await axios.get('https://api.sfox.com/v1/account/transactions', {
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    params: {
      limit: 1000
    }
  });
  
  const transactions = response.data;
  console.log(`\nTotal transactions: ${transactions.length}\n`);
  
  // Show all transactions with their symbols
  console.log('All transactions:');
  transactions.forEach((tx, i) => {
    console.log(`${i+1}. ${tx.day} | ${tx.action} ${tx.amount} ${tx.currency} | symbol="${tx.symbol || 'NULL'}" | net_proceeds=${tx.net_proceeds} | price=${tx.price}`);
  });
  
  // Filter for May 2025 SOL trades
  console.log('\n\nMay 2025 SOL transactions:');
  const maySOL = transactions.filter(tx => {
    const date = new Date(tx.day);
    return date.getMonth() === 4 && date.getFullYear() === 2025 && tx.currency === 'sol';
  });
  
  maySOL.forEach(tx => {
    console.log(`${tx.day} | ${tx.action} ${tx.amount} SOL | symbol="${tx.symbol}" | net_proceeds=${tx.net_proceeds} BTC | price=${tx.price}`);
  });
  
  // Write to file
  fs.writeFileSync('/tmp/glenn-transactions-full.json', JSON.stringify(transactions, null, 2));
  console.log('\n\nFull data written to /tmp/glenn-transactions-full.json');
}

main().catch(console.error);
