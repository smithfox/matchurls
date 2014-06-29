var express = require('express'),
    http = require('http'),
    path = require('path'),
    util = require("util"),
    Steam = require("./MatchProvider-steam").MatchProvider,
    MongoDB = require("./MatchProvider-mongodb").MatchProvider,
    config = require("./config");

var app = express(),
    steam = new Steam(
        config.steam_user,
        config.steam_pass,
        config.steam_name,
        config.steam_guard_code,
        config.cwd,
        config.steam_response_timeout),
    mongodb = new MongoDB(config.mongodb_host, config.mongodb_port);

// all environments
app.set('port', 3100);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
// if ('development' == app.get('env')) {
//   app.use(express.errorHandler());
// }

app.get('/', function(req, res){
    res.redirect("/page/matchurls");
});

var matchurls_func = function(req, res, content_type) {
    var matchId = req.query.matchid;
    if (!matchId) {
        if(content_type=="html") {
            // No match ID, display regular index.
            res.render('index', { title: 'match urls!' });
        } else {//json
            res.json({"err":"invalid matchid"});
        }
        res.end();
    }
    else {
        if (!isNaN(matchId) && parseInt(matchId, 10) < 1024000000000) {
            matchId = parseInt(matchId, 10);

            mongodb.findByMatchId(matchId, function(err, data) {
                if (err) {
                    console.log('mongodb find match err')
                    //throw err; 
                }

                if (data) {
                    // We have this appid data already in mongodb, so just serve from there.
                    if(content_type=="html") {
                        res.render('index', {
                            title: 'match urls!',
                            matchid: matchId,
                            replayState: data.state,
                            replayUrl: util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt)
                        });
                    } else {
                        res.json({"matchId":matchId,"replayId":data.id,"replayState":data.state,"replaySalt":data.salt,"replayUrl":util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt)})
                    }
                    res.end();
                }
                else if (steam.ready) {
                    // We need new data from Dota.
                    steam.getMatchDetails(matchId, function(err, data) {
                        if (err) {
                            if(content_type=="html") {
                                res.render('index', {
                                    title: 'match urls!',
                                    error: err
                                });
                            } else {
                                res.json({"err":err});
                            }
                            res.end();
                        }
                        else {
                            // Save the new data to Mongo
                            mongodb.save(data, function(err, cb){});
                            if(content_type=="html") {
                                res.render('index', {
                                    title: 'match urls!',
                                    matchid: matchId,
                                    replayState: data.state,
                                    replayUrl: util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt)
                                });
                            } else {
                                res.json({"matchId":matchId,"replayId":data.id,"replayState":data.state,"replaySalt":data.salt,"replayUrl":util.format("http://replay%s.valve.net/570/%s_%s.dem.bz2", data.cluster, data.id, data.salt)})

                            }
                            res.end();
                        }
                    });

                    // If Dota hasn't responded by 'request_timeout' then send a timeout page.
                    setTimeout(function(){
                        if(content_type=="html") {
                            res.render('index', {
                                title: 'match urls!',
                                error: "timeout"
                            });
                        } else {
                            res.json({"err":"timeout"});
                        }
                        res.end();
                    }, config.request_timeout);
                }
                else {
                    // We need new data from Dota, and Dota is not ready.
                    if(content_type=="html") {
                        res.render('index', {
                            title: 'match urls!',
                            error: "notready"
                        });
                    } else {
                        res.json({"err":"steam notready"});
                    }
                    res.end();
                }
            });
        }
        else {
            // Match ID failed validation.
            if(content_type=="html") {
                res.render('index', {
                    title: 'match urls!',
                    error: "invalid"
                });
            } else {
                res.json({"err":"invalid match id"});
            }
            res.end();
        }
    }
}

app.get('/page/matchurls', function(req, res){
    matchurls_func(req,res,"html");
});

app.get('/api/matchurls', function(req, res){
    matchurls_func(req,res,"json");
});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});