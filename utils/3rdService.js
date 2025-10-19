const axios = require('axios');

require('dotenv').config();


async function parseDyVideoUrl(videoUrl) {
  try {
    const dyVideoUrl = process.env.DY_VIDEO_URL;
    const dyVideoUrlHeaderKey = process.env.DY_VIDEO_URL_HEADER_KEY;
    const dyVideoUrlHeaderValue = process.env.DY_VIDEO_URL_HEADER_VALUE;
    
    const response = await axios.post(dyVideoUrl, {
      share_link: videoUrl
    }, {
      headers: {
        [dyVideoUrlHeaderKey]: dyVideoUrlHeaderValue
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error parsing dy video url:', error);
    throw error;
  }
}

module.exports = { parseDyVideoUrl };
