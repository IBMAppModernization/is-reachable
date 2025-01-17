'use strict';
const {promisify} = require('util');
const dns = require('dns');
const net = require('net');
const arrify = require('arrify');
const got = require('got');
const isPortReachable = require('is-port-reachable');
const pAny = require('p-any');
const pTimeout = require('p-timeout');
const prependHttp = require('prepend-http');
const routerIps = require('router-ips');
const URL = require('url-parse');

const dnsLookupP = promisify(dns.lookup);

const checkHttp = async url => {
	let response;
	try {
		response = await got(url, {rejectUnauthorized: false});
	} catch (error) {
		// HTTP errors are OK because it means endpoint is reachable
		console.log("checkHttp call to got returned error");
		if (error instanceof  got.HTTPError) {
	           console.log("checkHttp returned Http Error");
		   return true;
		}
		else
		   return false;
	}

	if (response.headers && response.headers.location) {
		console.log("checkHttp call to got returned response");
		const url = new URL(response.headers.location);
		const hostname = url.hostname.replace(/^\[/, '').replace(/\]$/, ''); // Strip [] from IPv6
		return !routerIps.has(hostname);
	}
	else 
	   console.log("checkHttp call to got returned no  response");

	return true;
};

const getAddress = async hostname => net.isIP(hostname) ? hostname : (await dnsLookupP(hostname)).address;

const isTargetReachable = async target => {
	const url = new URL(prependHttp(target));

	if (!url.port) {
		url.port = url.protocol === 'http:' ? 80 : 443;
	}

	console.log("isTargetReachable calling getAddress");
	let address;
	try {
		address = await getAddress(url.hostname);
	} catch (_) {
		return false;
	}

	console.log("isTargetReachable calling routerIps.has");
	if (!address || routerIps.has(address)) {
		return false;
	}

	console.log("isTargetReachable calling checkHttp");
	if ([80, 443].includes(url.port)) {
		return checkHttp(url.toString());
	}

	console.log("isTargetReachable calling isPortReachable");
	return isPortReachable(url.port, {host: address});
};

module.exports = async (destinations, options) => {
	options = {...options};
	options.timeout = typeof options.timeout === 'number' ? options.timeout : 5000;

	const promise = pAny(arrify(destinations).map(isTargetReachable));
	return pTimeout(promise, options.timeout).catch(() => false);
};
