import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Model configuration with fallbacks
const MODELS = {
  PRIMARY: 'gemini-2.5-pro',      // BEST accuracy (25 req/day per key)
  FALLBACK: 'gemini-2.5-flash',   // Good accuracy (500 req/day per key)
  FALLBACK2: 'gemini-2.0-flash'   // Good accuracy (1500 req/day per key)
};

export async function identifyAnimal(imageBuffer) {
  const modelsToTry = [MODELS.PRIMARY, MODELS.FALLBACK, MODELS.FALLBACK2];
  
  // Convert buffer to base64
  const base64Image = imageBuffer.toString('base64');
  
  const prompt = `You are an expert wildlife biologist. Analyze this image and identify the animal species.

Respond with ONLY a JSON object in this exact format (no other text):
{"commonName": "Peregrine Falcon", "scientificName": "Falco peregrinus"}

If the image does not contain an animal or you cannot identify it, respond with:
{"commonName": null, "scientificName": null}`;

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`🔄 Trying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      console.log(`✅ Success with model: ${modelName}`);
      
      // Parse JSON response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          
          if (data.commonName && data.scientificName) {
            // Fetch image from iNaturalist
            const imageUrl = await fetchINaturalistImage(data.commonName);
            
            return {
              success: true,
              commonName: data.commonName,
              scientificName: data.scientificName,
              imageUrl: imageUrl
            };
          }
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
      }
      
      return {
        success: false,
        error: 'Could not identify animal'
      };

    } catch (error) {
      console.error(`❌ Error with ${modelName}:`, error.message);
      lastError = error;
      // Continue to next model
    }
  }

  // All models failed
  return {
    success: false,
    error: lastError?.message || 'All models failed'
  };
}

// Fetch image from iNaturalist
async function fetchINaturalistImage(speciesName) {
  try {
    const searchUrl = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(speciesName)}&per_page=1`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const taxon = data.results[0];
      if (taxon.default_photo && taxon.default_photo.medium_url) {
        return taxon.default_photo.medium_url;
      }
    }
    return null;
  } catch (error) {
    console.error('iNaturalist fetch error:', error);
    return null;
  }
}
