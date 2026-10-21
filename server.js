// ============================================================
//  DEMO STRIPE: Pago único + Suscripción + Webhooks
// ============================================================

// 1. Cargar herramientas
require('dotenv').config();                                    // lee el .env
const express = require('express');                            // framework web
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // SDK con tu llave

const app = express();
const PORT = process.env.PORT || 4242;

// ============================================================
//  WEBHOOK — va ANTES de express.json() (ojo, importante)
// ============================================================
//  Un webhook es el aviso que Stripe le manda a tu servidor cuando
//  algo pasa (ej: "ya pagaron"). Es la fuente CONFIABLE de verdad:
//  nunca confíes en el frontend para saber si alguien pagó.
//
//  Usa express.raw (no express.json) porque Stripe FIRMA el mensaje
//  y para verificar la firma necesitamos el cuerpo tal cual llegó.

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const firma = req.headers['stripe-signature'];
    let evento;

    try {
        // Verificar que el mensaje de verdad viene de Stripe (no de un impostor)
        evento = stripe.webhooks.constructEvent(
            req.body,
            firma,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.log(`⚠️ Webhook inválido: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ¿Qué tipo de evento llegó?
    switch (evento.type) {
        case 'checkout.session.completed': {
            const session = evento.data.object;
            const tipo = session.mode === 'subscription' ? 'SUSCRIPCIÓN' : 'PAGO ÚNICO';
            console.log(`✅ ${tipo} completado. Cliente: ${session.customer_email || session.customer}`);
            // ---> En producción: aquí activas la cuenta, mandas correo, guardas en BD
            break;
        }
        case 'invoice.paid': {
            const invoice = evento.data.object;
            console.log(`💰 Renovación mensual cobrada: $${invoice.amount_paid / 100}`);
            break;
        }
        case 'invoice.payment_failed': {
            console.log(`❌ Falló el cobro de renovación`);
            break;
        }
        default:
            console.log(`Evento recibido: ${evento.type}`);
    }

    res.json({ recibido: true }); // responder 200 a Stripe
});

// ============================================================
//  De aquí en adelante, SÍ usamos express.json y archivos estáticos
// ============================================================
app.use(express.json());
app.use(express.static('public'));

// ============================================================
//  RUTA: Crear sesión de pago (recibe el tipo: 'subscription' o 'payment')
// ============================================================
app.post('/crear-checkout', async (req, res) => {
    try {
        const { tipo } = req.body; // viene del frontend: 'subscription' o 'payment'

        // Elegir el precio y el modo según el tipo
        const esSubscripcion = tipo === 'subscription';
        const priceId = esSubscripcion
            ? process.env.STRIPE_PRICE_SUBSCRIPTION
            : process.env.STRIPE_PRICE_ONETIME;

        const session = await stripe.checkout.sessions.create({
            mode: esSubscripcion ? 'subscription' : 'payment',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `http://localhost:${PORT}/exito.html`,
            cancel_url: `http://localhost:${PORT}/cancelado.html`,
        });

        res.json({ url: session.url }); // devolver la URL de pago al frontend
    } catch (error) {
        console.log('Error creando checkout:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
//  Encender el servidor
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor en http://localhost:${PORT}`);
});
