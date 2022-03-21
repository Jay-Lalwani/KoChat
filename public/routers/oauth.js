#!usr/bin/node
const express = require('express');
const router = express.Router();
const {  AuthorizationCode } = require('simple-oauth2');

var https = require('https');


// -------------- variable initialization -------------- //

// These are parameters provided by the authenticating server when
// we register our OAUTH client.
// -- The client ID is going to be public
// -- The client secret is super top secret. Don't make this visible
// -- The redirect uri should be some intermediary 'get' request that 
//     you write in whichyou assign the token to the session.

//  YOU GET THESE PARAMETERS BY REGISTERING AN APP HERE: https://ion.tjhsst.edu/oauth/applications/    

var ion_client_id = 'FDOinGqnOM7rS3WkRtWH9e3pADdupGlSoSktRVGo';
var ion_client_secret = 'GIMlDUT9OTvCk8PlXW0DUfvkoBmUuw8rritb2kCg1M79LMxVTySkF5yQWvqsD2gJ4A4k1HwVEneOT9DHI63MOPHCttKzaKKqyCTF8ujfHAPTL4xzzlLX7dILnsvyCrZf';
var ion_redirect_uri = 'https://web-chat-test.sites.tjhsst.edu/login_worker';    //    <<== you choose this one

// Here we create an oauth2 variable that we will use to manage out OAUTH operations

var client = new AuthorizationCode({
  client: {
    id: ion_client_id,
    secret: ion_client_secret,
  },
  auth: {
    tokenHost: 'https://ion.tjhsst.edu/oauth/',
    authorizePath: 'https://ion.tjhsst.edu/oauth/authorize',
    tokenPath: 'https://ion.tjhsst.edu/oauth/token/'
  }
});

// This is the link that will be used later on for logging in. This URL takes
// you to the ION server and asks if you are willing to give read permission to ION.
const OAUTH_SCOPE = 'read';
var authorizationUri = client.authorizeURL({
    scope: OAUTH_SCOPE,
    redirect_uri: ion_redirect_uri
});



// -------------- express 'get' handlers -------------- //

function checkAuthentication(req,res,next) {
    res.locals.logged_in = false;
    
    if ('authenticated' in req.session) {
        // the user has logged in
        res.locals.logged_in = true;
        
        
    }
    else {
        
        // the user has not logged in
        res.locals.login_link = authorizationUri;
        
    }
    next()
}

function retrieveIonId(req,res,next) {
    
    var access_token = res.locals.token.access_token;
    var profile_url = 'https://ion.tjhsst.edu/api/profile?format=json&access_token='+access_token;
    
    https.get(profile_url, function(response) {
    
      var rawData = '';
      response.on('data', function(chunk) {
          rawData += chunk;
      });
    
      response.on('end', function() {
        res.locals.profile = JSON.parse(rawData);
        
        var id, ion_username, display_name;
        ({id, ion_username, display_name} = res.locals.profile);
        req.session.id = id;
        req.session.display_name = display_name
        
        var sql    = 'INSERT INTO profile (id, ion_username, display_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id=id;';
        var params = [id, ion_username, display_name];
        res.app.locals.pool.query(sql, params, function(error, results, fields){
            if (error) throw error;
            next(); 
        });
      });
    
    }).on('error', function(err) {
        next(err)
    });

}

function getUserName(req,res,next) {
    
    var access_token = req.session.token.access_token;
    var profile_url = 'https://ion.tjhsst.edu/api/profile?format=json&access_token='+access_token;
    
    https.get(profile_url, function(response) {
    
      var rawData = '';
      response.on('data', function(chunk) {
          rawData += chunk;
      });
    
      response.on('end', function() {
        res.locals.profile = JSON.parse(rawData);
        next(); 
        
      });
    
    }).on('error', function(err) {
        next(err)
    });
    

}


router.get('/logout', function (req, res) {
    
    delete req.session.authenticated;
    res.redirect('https://web-chat-test.sites.tjhsst.edu/');

});


// -------------- intermediary login_worker helper -------------- //
async function convertCodeToToken(req, res, next) {
    var theCode = req.query.code;

    var options = {
        'code': theCode,
        'redirect_uri': ion_redirect_uri,
        'scope': OAUTH_SCOPE
     };
    
    // needed to be in try/catch
    try {
        var accessToken = await client.getToken(options);      // await serializes asyncronous fcn call
        res.locals.token = accessToken.token;
        next()
    } 
    catch (error) {
        console.log('Access Token Error', error.message);
         res.send(502); // error creating token
    }
}
function setAuthenticated(req,res,next) {
    req.session.authenticated = true;
    req.session.token = res.locals.token;
    next();
}

function getProfile(req,res,next){

    if ('authenticated' in req.session) {
        var sql = 'SELECT id, ion_username, display_name FROM profile where id=?';
        var params = [req.session.id];
        
        res.app.locals.pool.query(sql, params, function(error, results, fields){
            // console.log(results)

            if (error) throw error;
            res.locals.ion_username = results[0].ion_username;
            res.locals.display_name = results[0].display_name;
            next(); 
        });
    } else {
        next();
    }
}
async function possiblyRefreshToken(req,res,next) {
    if ('token' in req.session) {
        
        var accessToken = client.createToken(req.session.token); //recreate a token (class) instance
        if (accessToken.expired()) {
            try {
                const refreshParams = {
                    'scope' : OAUTH_SCOPE,
                };
        
                req.session.token = await accessToken.refresh(refreshParams);
            } catch (error) {
                console.log('Error refreshing access token: ', error.message);
                return;
            }
        }
    }
    next();
}
router.get('/login_worker', [convertCodeToToken, setAuthenticated, retrieveIonId], function(req, res) { 

    req.session.authenticated = true;
    req.session.token = res.locals.token;
    
    res.redirect('https://web-chat-test.sites.tjhsst.edu/');
    
});
module.exports.oauth_router = router;
module.exports.checkAuthentication = [checkAuthentication, possiblyRefreshToken, getProfile];
module.exports.getUserName = [getUserName];