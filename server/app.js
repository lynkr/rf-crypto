var path = require('path');
var express = require('express');
var app = express();
var server = require('http').createServer(app);

var Promise = require('bluebird');
var mongoose = require('mongoose');

require('dotenv').config();

// GDAX
const Gdax = require('gdax');
const GDAXSocket = new Gdax.WebsocketClient(['BTC-USD', 'ETH-USD']);

var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

var ExecuteRequest = require('./RequestHandlers');

// Connection to MongoDB Altas via mongoose
mongoose.Promise = Promise;
var db_uri = process.env.DB_URI;

mongoose.connect(db_uri, (err) => {if (err) console.log("Mongoose error: " + err)});


var Orders = require('./Orders');
var Historical = require('./models/Historical')

// Creates genesis record in Historical if one does not exist already.
Historical.findOne({type:'latest'}).then(function(latest) { 
	if (!latest) {
		let newLatest = Historical({
			ethUSD: 0,
			btcUSD: 0,
			type: 'latest'
		})
		newLatest.save()
		console.log('New latest price record created')
	}
})

var reviewOrder = function(historical, price, filledOrder, crypto) {
	historical[crypto] = price
	console.log(crypto + ' price updated to ' + historical[crypto])
	Orders.checkAlerts(filledOrder).then(function(found) {
		if (found) {
			console.log('price alert:' + filledOrder.product_id + " at " + price)
		}
	})
	historical.save()
}


// GDAX websocket
GDAXSocket.on('message', function(newOrder) {
	Orders.filledOrder(newOrder).then(function(filledOrder) {
		Historical.findOne({type:'latest'}).then(function(historical) {
			let price = parseFloat(Math.round(filledOrder.price * 100) / 100).toFixed(2);
			if(historical) {
				if (filledOrder.product_id === 'ETH-USD') {
					reviewOrder(historical, price, filledOrder, 'ethUSD')
				}
				if (filledOrder.product_id === 'BTC-USD') {
					reviewOrder(historical, price, filledOrder, 'btcUSD')
				}
			}
		})
	})
})


// Google Assistant
app.post('/gAssistant', function(req, res) {
	ExecuteRequest.FromGoogle(req.body, res);
})

// Amazon Alexa 
app.post('/alexa', function(req, res) {
    ExecuteRequest.FromAlexa(req.body, res);
})

var Admin = require('./Admin/api');
app.use('/admin', Admin);

server.listen(process.env.PORT || 8080, function() {
	console.log("Node server started")
});