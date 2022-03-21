// -------------- load packages -------------- //
var express = require('express')
var app = express();

var https = require('https');
var hbs = require('hbs');
var path = require('path');
app.set('view engine', 'hbs');
var cookieSession = require('cookie-session');
var cookieParser = require('cookie-parser');
//console.log(__dirname)

app.set('trust proxy', 1); // trust first proxy
app.use(cookieSession({
  name: 'cookie',
  keys: ['aihwfvjsjfdjhbsdifsdj', 'sdfjawnbfjihosdjfjvbhd']
}));
app.use(cookieParser());

app.use(express.static(path.join(__dirname,'views')));


// -------------- express 'get' handlers -------------- //

var io;

const {oauth_router, checkAuthentication, getUserName} = require('./routers/oauth.js');
app.use(oauth_router);
require('./config/config_sql.js')(app);


app.get('/', [checkAuthentication], function(req, res){
    req.session.display_name = res.locals.display_name;
    req.session.login_link = res.locals.login_link;
    
    if (!('authenticated' in req.session))
        res.render('loginPage/loginPage', {'login_link' : res.locals.login_link});
    else
    {
        res.locals.adminRights = false;
        if(res.locals.ion_username == '2023jlalwani' ||  res.locals.ion_username == 'pckosek'){
            res.locals.adminRights = true;
            console.log('Admin Rights Given To: ' + res.locals.ion_username)
        }

        res.render('Home/home', {'Name' : res.locals.display_name, "logged_in": true, "admin": res.locals.adminRights});
    }
});



// -------------- listener -------------- //
// The listener is what keeps node 'alive.'
var server = app.listen(process.env.PORT || 8080, process.env.HOST || "0.0.0.0", function() {


    io = require('socket.io')(server);
    const users = {};
    io.on('connection',function(socket){                  // called when a new socket connection is made
   
        //console.log('new socket connection');
        
            var sql = 'SELECT * FROM messages;';
            app.locals.pool.query(sql, function(error, results, fields){
            
            messageCount = Object.keys(results).length;

            for (let i = (messageCount - 25); i < messageCount; i++) {
                if(i < 0){
                    continue;
                }

                socket.emit('chat-message', { message: results[i].message, name: results[i].user });
                }
            });
            
             sql = 'SELECT * FROM line;';
            app.locals.pool.query(sql, function(error, results, fields){
            
            messageCount = Object.keys(results).length;

            for (let i = (messageCount - 35); i < messageCount; i++) {
                if(i < 0){
                    continue;
                }

                socket.emit('line-add', {name: results[i].name });
                }
            });
            
        socket.on('new-user', function(name) {
        
        users[socket.id] = name;
        io.emit('user-connected', name);
        size = Object.keys(users).length - 1;
        
        io.emit('active-users', size);
         });
    
    
    socket.on('send-chat-message', message => {
      
      var sql = 'INSERT INTO messages (user, message) VALUES (?, ?);';
        app.locals.pool.query(sql,[users[socket.id], message],function(error, results, fields){
        console.log(results);
    });
    io.emit('chat-message', { message: message, name: users[socket.id] });
  });
  
  socket.on('send-line-add', issue => {
      
      
      var sql = 'INSERT INTO line (name) VALUES (?);';
        app.locals.pool.query(sql,[users[socket.id]],function(error, results, fields){
        console.log(results[0]);
    });
    
    io.emit('line-add', { name: users[socket.id] });
  });
  
    socket.on('send-admin-remove', issue => {

      var sql = 'DELETE FROM line WHERE name=?;';
        app.locals.pool.query(sql, [issue], function(error, results, fields){
        console.log(results[0]);
    });
    
    io.emit('line-adjust', { name: issue });
  });
  
      socket.on('send-clear-line', issue => {

      var sql = 'TRUNCATE TABLE line;';
        app.locals.pool.query(sql, function(error, results, fields){
        console.log(results[0]);
    });
    
    io.emit('line-clear', { name: users[socket.id] });
  });
  
    
    socket.on('send-line-remove', issue => {
    
      var sql = 'DELETE FROM line WHERE name=?;';
        app.locals.pool.query(sql, [users[socket.id]], function(error, results, fields){
        console.log(results[0]);
    });
    
    io.emit('line-adjust', { name: users[socket.id] });
  });
  
  socket.on('disconnect', () => {
    io.emit('user-disconnected', users[socket.id]);
    delete users[socket.id];
    size = Object.keys(users).length - 1;
        
        io.emit('active-users', size);
  });
   
    });
    console.log('express server started');


});