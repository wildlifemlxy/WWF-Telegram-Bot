import express from 'express';
import cors from 'cors';
import identifyRoutes from './routes/identifyRoutes.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/identify', identifyRoutes);

// Error handler (404 and server errors)
app.use((err, req, res, next) => {
  if (err) {
    console.error(err.stack);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
  res.status(404).json({ error: 'Not Found' });
});

export default app;
