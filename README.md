# DNK Hub — Backend de pagos

Este servidor conecta tu sitio con NOWPayments para confirmar pagos en cripto
automáticamente y entregar la key al instante.

## Cómo subirlo (con Render, es gratis para empezar)

1. Crea una cuenta en **render.com** (puedes entrar con tu cuenta de GitHub).
2. Sube esta carpeta a un repositorio de GitHub (o arrástrala directo si
   Render te da la opción de subir código sin GitHub).
3. En Render: **New +** → **Web Service** → conecta el repo.
4. Configuración:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. En la sección **Environment**, agrega estas 2 variables (con tus valores
   reales, NO los que están en `.env.example`):
   - `NOWPAYMENTS_API_KEY`
   - `NOWPAYMENTS_IPN_SECRET`
6. Dale **Deploy**. Cuando termine, Render te da una URL parecida a:
   `https://dnk-hub-backend.onrender.com`

## Conectar la URL en NOWPayments

1. Entra a NOWPayments → Configuración → Pagos → busca el campo de
   **IPN callback URL** (o déjalo como está: el servidor ya le dice a
   NOWPayments a dónde avisar en cada pago que crea, así que este paso es
   opcional a menos que quieras ponerla fija).

## Conectar la URL en el sitio (dnk-hub-site.html)

Cuando tengas tu URL de Render, avísame y actualizo el checkout del sitio
para que hable con este servidor en vez de mostrar el flujo simulado que
tiene ahora.

## Importante

- Nunca subas el archivo `.env` real a un repositorio público — solo las
  variables van en el panel de Render.
- El plan gratis de Render "duerme" el servidor si no recibe tráfico por un
  rato, y tarda unos segundos en despertar en la siguiente visita. Si
  quieres que esté siempre activo al instante, el plan pago (unos $7/mes)
  lo evita.
