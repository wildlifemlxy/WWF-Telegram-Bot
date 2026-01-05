import { identifyAnimal } from '../../services/animalIdentifier.js';
//ok

export const identifyController = {
  // Single handler for /identify endpoint
  // Use query param ?action=health or body { action: "health" } for health check
  // Use body { action: "identify", imageBase64: "..." } for identification
  handleRequest: async (req, res) => {
    const action = req.query.action || req.body?.action || 'identify';

    if (action === 'health') {
      return res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'Animal Identification API'
      });
    }

    if (action === 'identify') {
      try {
        const { imageBuffer, imageBase64, location } = req.body;
        
        if (!imageBuffer && !imageBase64) {
          return res.status(400).json({
            success: false,
            error: 'No image provided. Send imageBase64 in request body.'
          });
        }

        // Convert base64 to buffer if needed
        const buffer = imageBase64 
          ? Buffer.from(imageBase64, 'base64')
          : Buffer.from(imageBuffer);

        const result = await identifyAnimal(buffer, location);

        if (result.success) {
          return res.json({
            success: true,
            data: result.response
          });
        } else {
          return res.status(400).json({
            success: false,
            error: result.error
          });
        }
      } catch (error) {
        console.error('Controller Error:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    }

    // Unknown action
    return res.status(400).json({
      success: false,
      error: `Unknown action: ${action}. Use 'identify' or 'health'.`
    });
  }
};
