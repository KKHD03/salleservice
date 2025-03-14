const express = require('express');
const Parse = require('parse/node');

const app = express();
app.use(express.json()); // Use built-in JSON middleware
const port = process.env.PORT || 3000;

// Initialize Parse once
Parse.initialize("p0Gg1z9AprRYhRmUIQD5V3weGqYKRDYSw4x6tHQO", "1IicjtUPLXk7xhhHa8sBAMwmMbET9Xcthr44rhL6");
Parse.serverURL = "https://parseapi.back4app.com/";

// Define classes outside the handler
const Payment = Parse.Object.extend("Payment");
const Booking = Parse.Object.extend("Booking");
const SettingQuery = new Parse.Query('Setting');

// Validation middleware
const validateRequestBody = (req, res, next) => {
  const requiredFields = ['identifier', 'amount', 'payment_method', 'payment_reference', 'phone_number', 'tx_reference'];
  const missing = requiredFields.filter(field => !req.body[field]);
  
  if (missing.length) {
    return res.status(400).json({ 
      success: false, 
      error: `Missing required fields: ${missing.join(', ')}`
    });
  }
  next();
};

app.post('/confirmation', validateRequestBody, async (req, res) => {
  try {
    const { body } = req;

    // Get API key from settings
    const setting = await SettingQuery.select('apiKey').first();
    if (!setting) {
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }
    const apiKey = setting.get('apiKey');

    // Verify payment with Paygate
    const paygateResponse = await fetch('https://paygateglobal.com/api/v1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        auth_token: apiKey, 
        tx_reference: body.tx_reference 
      })
    });

    if (!paygateResponse.ok) {
      throw new Error(`Paygate API error: ${paygateResponse.statusText}`);
    }

    const statusMessages = {
      0: "Succès",
      2: "En cours",
      4: "Expiré",
      6: "Annulé"
  };

    const paygateData = await paygateResponse.json();

    // Create and save payment
    const booking = new Booking();
    booking.id = body.identifier.split('_')[1];

    const payment = new Payment();
    payment.set({
      booking,
      amount: body.amount,
      mode: body.payment_method,
      ref: body.payment_reference,
      mobile: body.phone_number,
      status: statusMessages[paygateData.status] || "Inconnu"
    });

    const savedPayment = await payment.save();
    
    res.status(201).json({
      success: true,
      objectId: savedPayment.id
    });

  } catch (error) {
    console.error('Error processing payment:', error);
    const status = error.code || 500;
    res.status(status).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});