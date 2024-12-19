import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { OpenAI } from 'openai';
import Stripe from 'stripe';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/saas';
const STRIPE_SECRET = process.env.STRIPE_SECRET || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2022-11-15' });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// MongoDB Models
const UserSchema = new mongoose.Schema({
  clerkUserId: { type: String, required: true, unique: true },
  uploads: [
    {
      fileName: String,
      transcription: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  hasPaid: { type: Boolean, default: false },
});
const User = mongoose.model('User', UserSchema);

// File upload setup
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors({ origin: 'http://localhost:3000' })); // Дозволяємо запити з фронтенду
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// MongoDB Connection
async function connectToMongoDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}
connectToMongoDB();

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Routes
app.post('/api/voice/transcribe', upload.single('file'), async (req: Request, res: Response) => {
  const clerkUserId = req.headers['clerk-user-id'] as string;

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Unauthorized: Missing Clerk User ID' });
  }

  try {
    let user = await User.findOne({ clerkUserId });

    // Створюємо користувача, якщо він не існує
    if (!user) {
      user = new User({ clerkUserId, uploads: [], hasPaid: false });
      await user.save();
    }

    // Перевіряємо ліміти
    if (!user.hasPaid && user.uploads.length >= 2) {
      return res.status(403).json({ error: 'Limit exceeded. Please make a payment to upload more files.' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = file.path;

    // Емуляція транскрипції (замініть на ваші API виклики)
    const transcriptionResponse = { data: { text: `Mock transcription for ${file.originalname}` } };
    const transcription = transcriptionResponse?.data?.text || 'No transcription available';

    // Додаємо інформацію в базу даних
    user.uploads.push({
      fileName: file.originalname,
      transcription,
    });
    await user.save();

    // Видаляємо файл після обробки
    const fs = require('fs');
    fs.unlink(filePath, (err: any) => {
      if (err) console.error('Error deleting file:', err);
    });

    res.json({ transcription });
  } catch (err) {
    console.error('Error during transcription:', err);
    res.status(500).json({ error: 'Failed to process transcription' });
  }
});

app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  if (!endpointSecret) {
    return res.status(500).json({ error: 'Stripe webhook secret not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig!, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const clerkUserId = session.metadata?.clerkUserId;

    if (clerkUserId) {
      const user = await User.findOne({ clerkUserId });
      if (user) {
        user.hasPaid = true;
        await user.save();
      }
    }
  }

  res.json({ received: true });
});


app.post('/api/payment/create-checkout-session', async (req: Request, res: Response) => {
  const clerkUserId = req.headers['clerk-user-id'] as string;

  if (!clerkUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Unlimited Transcription Access',
            },
            unit_amount: 1000,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/success`,
      cancel_url: `${req.headers.origin}/cancel`,
      metadata: {
        clerkUserId: clerkUserId,
      },
    });

    // Update the user's payment status
    const user = await User.findOne({ clerkUserId });
    if (user) {
      user.hasPaid = true;
      await user.save();
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creating Stripe session:', err);
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
});


// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
