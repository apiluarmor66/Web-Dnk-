// DNK HUB — backend de pagos
// Crea órdenes de pago en NOWPayments, verifica el webhook (IPN) cuando el
// pago se confirma, genera una key y la deja lista para que el sitio la
// entregue al comprador.

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();

// NOWPayments manda el webhook con el body ya serializado; lo necesitamos
// en texto crudo (raw) para poder verificar la firma antes de parsearlo.
app.use('/api/ipn', express.raw({ type: '*/*' }));
app.use(express.json());
app.use(cors());

const {
  NOWPAYMENTS_API_KEY,
  NOWPAYMENTS_IPN_SECRET,
  PORT = 3000,
} = process.env;

if (!NOWPAYMENTS_API_KEY || !NOWPAYMENTS_IPN_SECRET) {
  console.warn('⚠️  Faltan NOWPAYMENTS_API_KEY o NOWPAYMENTS_IPN_SECRET en las variables de entorno.');
}

// ---------- "Base de datos" simple en un archivo JSON ----------
// Para un solo producto y bajo volumen esto es suficiente. Si más adelante
// vendes más y quieres algo más robusto, se cambia por una base real
// (Postgres, SQLite, etc.) sin tocar el resto de la lógica.
const DB_PATH = path.join(__dirname, 'orders.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return {}; }
}
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = 'DNK-';
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) key += chars[Math.floor(Math.random() * chars.length)];
    if (i < 3) key += '-';
  }
  return key; // formato: DNK-XXXX-XXXX-XXXX-XXXX
}

// ---------- 1) Crear un pago ----------
// El sitio llama esto cuando el comprador da clic en "Pagar con cripto".
app.post('/api/create-payment', async (req, res) => {
  try {
    const orderId = 'DNK-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

    const resp = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: 7,
        price_currency: 'usd',
        pay_currency: 'usdttrc20',
        order_id: orderId,
        order_description: 'DNK Script',
        ipn_callback_url: `${req.protocol}://${req.get('host')}/api/ipn`,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error('Error creando pago en NOWPayments:', data);
      return res.status(502).json({ error: 'No se pudo crear el pago', detail: data });
    }

    const db = readDB();
    db[orderId] = {
      status: 'pending',
      payment_id: data.payment_id,
      pay_address: data.pay_address,
      pay_amount: data.pay_amount,
      pay_currency: data.pay_currency,
      key: null,
      created_at: new Date().toISOString(),
    };
    writeDB(db);

    res.json({
      order_id: orderId,
      payment_id: data.payment_id,
      pay_address: data.pay_address,
      pay_amount: data.pay_amount,
      pay_currency: data.pay_currency,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno creando el pago' });
  }
});

// ---------- 2) Webhook de NOWPayments (IPN) ----------
// NOWPayments llama esta URL sola, apenas detecta el pago en la blockchain.
app.post('/api/ipn', (req, res) => {
  try {
    const signature = req.headers['x-nowpayments-sig'];
    if (!signature) return res.status(400).send('Falta firma');

    // Verificar que el webhook de verdad viene de NOWPayments (HMAC-SHA512
    // con las claves del body ordenadas alfabéticamente, tal como pide su doc).
    const rawBody = req.body.toString('utf8');
    const parsed = JSON.parse(rawBody);
    const sortedBody = JSON.stringify(sortKeys(parsed));

    const expectedSig = crypto
      .createHmac('sha512', NOWPAYMENTS_IPN_SECRET)
      .update(sortedBody)
      .digest('hex');

    if (expectedSig !== signature) {
      console.warn('Firma IPN inválida — posible webhook falso, se ignora.');
      return res.status(401).send('Firma inválida');
    }

    const { order_id, payment_status } = parsed;
    const db = readDB();
    const order = db[order_id];

    if (order && ['finished', 'confirmed'].includes(payment_status)) {
      if (!order.key) {
        order.key = generateKey();
        order.status = 'paid';
        order.paid_at = new Date().toISOString();
        writeDB(db);
        console.log(`✅ Pago confirmado para ${order_id} → key ${order.key}`);
      }
    } else if (order) {
      order.status = payment_status; // waiting / confirming / partially_paid / failed / expired
      writeDB(db);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Error procesando IPN:', err);
    res.status(500).send('Error interno');
  }
});

function sortKeys(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  return Object.keys(obj).sort().reduce((acc, k) => {
    acc[k] = sortKeys(obj[k]);
    return acc;
  }, {});
}

// ---------- 3) El sitio pregunta: "¿ya está pagado?" ----------
app.get('/api/order-status/:orderId', (req, res) => {
  const db = readDB();
  const order = db[req.params.orderId];
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

  res.json({
    status: order.status,
    key: order.status === 'paid' ? order.key : null,
  });
});

app.get('/', (_req, res) => res.send('DNK HUB backend está corriendo ✅'));

app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
