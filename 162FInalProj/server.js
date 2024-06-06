const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const canvas = require('canvas');
const initializeDB = require('./populatedb');
const showDatabaseContents = require('./showdb');
const fs = require('fs');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const dotenv = require('dotenv');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
dotenv.config();
const app = express();
const PORT = 3000;
const dbfile = process.env.DATABASEU;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;



passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});






/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Set up Handlebars view engine with custom helpers
//

//Setting up SQl 
let db;
(async () => {
    try {
        console.log("hey zere!");
        let dbexist = fs.existsSync('JFitness.db');
        if (dbexist) {
            db = await sqlite.open({ filename: 'JFitness.db', driver: sqlite3.Database });
            console.log('Database opened');

        } else {
            console.log("hello!!!");
            db = await initializeDB();
            console.log('Database Created');
        }
        await showDatabaseContents(db);

    } catch (err) {
        console.error('Error with database:', err);
    }
})();




app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
        },
    })
);

app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: process.env.SESSION_SECRET,     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);


app.use(passport.initialize());
app.use(passport.session());

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use((req, res, next) => {
    res.locals.appName = 'JFitness Blog';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//


app.get('/auth/google', passport.authenticate('google', {

    scope: ['profile', 'email'] // Used to specify the required data
}));




app.get('/auth/google/callback',
passport.authenticate('google', { failureRedirect: '/' }),
    async (req, res) => {
        const googleId = req.user.id;
        const hashedGoogleId = hash(googleId);
        req.session.hashedGoogleId = hashedGoogleId;
        // Check if user already exists
        try {
            let localUser = await findUserByHashedGoogleId(hashedGoogleId);
            if (localUser) {
                req.session.userId = localUser.id;
                req.session.loggedIn = true;
                res.redirect('/');
            } else {
                res.redirect('/registerUsername');
            }
        } catch(err) {
            console.error('Error finding user:', err);
            res.redirect('/error');
        }
    }
);


app.get('/registerUsername', (req, res) => {
    res.render('registerUsername');
});


app.post('/registerUsername', async (req, res) => {
    const username = req.body.username;
    const hashedGoogleId = req.session.hashedGoogleId;
    try {
        let theuser = await findUserByUsername(username);
        if (theuser) {
            res.redirect('/registerUsername?error=User%20already%20exists!!!');
        } else {
            await addUser(req, username);
            let newusername = await findUserByUsername(username);
            req.session.userId = newusername.id;
            req.session.loggedIn = true;
            res.redirect('/');
        }
    } catch (err) {
        console.error('Error registering username:', err);
    }
});


app.get('/', async (req, res) => {

    /*
    console.log("Comments changed: adasd");
    const posts = await getPosts();
    const user = await getCurrentUser(req) || {};

    for (let i = 0; i < posts.length; i++) {
        console.log("Comments changed: ");
        posts[i].comments = await GetCommmentsbyID(posts[i].id);
      
        console.log(posts[i]);
    }




    res.render('home', { posts, user });
    */

        const posts = await getPosts();
        const user = await getCurrentUser(req) || {};

        for (let i = 0; i < posts.length; i++) {
            console.log("Comments changed: ");
            posts[i].comments = await GetCommentsbyID(posts[i].id);
          
            console.log(posts[i]);
        }
        
        console.log("Rendering home page with posts:", posts);
        res.render('home', { posts, user });
    });


// Register GET route is used for error response from registration
//
app.get('/register', (req, res) => {
    console.log('error for register');
    res.render('loginRegister', { regError: req.query.error });
});

// Login route GET route is used for error response from login
//
app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Error route: render error page
//
app.get('/error', (req, res) => {
    res.render('error');
});


app.get('/keyword', (req, res) => {
    res.render('searchbykeyword', []);




});

// Additional routes that you must implement


app.post('/posts', async (req, res) => {
    // TODO: Add a new post and redirect to home

    let title = req.body.title;
    let content = req.body.content;
    let userobj = await findUserById(req.session.userId);
    await addPost(title, content, userobj);
    res.redirect('/');


});


app.post('/comments', async (req, res) => {
    //Adds post comments. 
    let commentcontent = req.body.comment;
    let userobj = await findUserById(req.session.userId);
    console.log("hello");
    await addComment(userobj, commentcontent, req.body.postId);





    console.log('redireciton here');
    res.redirect('/');
});


app.post('/keywords', async (req, res)  => {
    let currentkeyword = req.body.keyword; 
    let postsselected = await getPostsByKeyword(currentkeyword);

    res.render('searchbykeyword', {posts: postsselected});
}); 


app.post('/like/:id', async (req, res) => {
    // TODO: Update post likes
    await updatePostLikes(req, res);
});
app.get('/profile', isAuthenticated, async (req, res) => {
    // TODO: Render profile page
    //Lets do this next 
    console.log("profile rendering....");
    await renderProfile(req, res);
});
app.get('/avatar/:username', async (req, res) => {
    // TODO: Serve the avatar image for the user
    console.log("trying to load avatar");
    await handleAvatar(req, res);
});
app.post('/register', async (req, res) => {
    // TODO: Register a new user
    // First Thing I do 

    const submitteduser = req.body.username;


    let userresult = await findUserByUsername(submitteduser);
    if (userresult) {
        console.log('username found!');
        res.redirect('/register?error=User%20already%20exists!!!');
    } else {
        await registerUser(req, res);
    }
});
app.post('/login', async (req, res) => {
    // TODO: Login a user
    await loginUser(req, res);
});
app.get('/logout', (req, res) => {
    // TODO: Logout the user
    logoutUser(req, res);
});
app.post('/delete/:id', isAuthenticated, async (req, res) => {
    // TODO: Delete a post if the current user is the owner
    const postId = req.params.id;

//changet this later for authentication 


    try {
        await db.run('DELETE FROM posts WHERE id = ?', [postId]);
        res.status(200).json({message: 'sucessful delete'});
        console.log('sucessful delete')
    } catch (err) {
        console.error('deletion post error', err);
        res.status(400).json({ message: 'You cannot delete this post' });; 
    }


    /*
    for (let i = 0; i < posts.length; i++) {
        if (posts[i].id == postId && posts[i].username == getCurrentUser(req).username) {
            console.log("HIMBEAST!!!");
            posts.splice(i, 1);
            res.status(200).json({message: 'sucessful delete'});
        }
    }
    res.status(400).json({ message: 'You cannot delete this post' });
    */
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Example data for posts and users
let posts = [
    { id: 1, title: 'Sample Post', content: 'This is a sample post.', username: 'SampleUser', timestamp: '2024-01-01 10:00', likes: 0 },
    { id: 2, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0 },
];
let users = [
    { id: 1, username: 'SampleUser', avatar_url: undefined, memberSince: '2024-01-01 08:00' },
    { id: 2, username: 'AnotherUser', avatar_url: undefined, memberSince: '2024-01-02 09:00' },
];

// Function to find a user by username
async function findUserByUsername(username) {
    // TODO: Return user object if found, otherwise return undefined
    try {

        let currentusername = username;
        const userobj = db.get('SELECT * FROM users WHERE username = ?', [currentusername]
        );
        return userobj;
    } catch (err) {
        console.log("username error: ", err)
        
    }
    /*
    for (i = 0; i < users.length; i++) {
        if (users[i].username == username) {
            return users[i];
        }
    }
    return undefined;
    */
    
}

// Function to find a user by user ID
async function findUserById(userId) {
    // TODO: Return user object if found, otherwise return undefined
    /*
    for (i = 0; i < users.length; i++) {
        if (users[i].id == userId) {
            return users[i];
        }
    }
    */

    try {
        const theuserobj = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        console.log(theuserobj.memberSince);
        return theuserobj;
    } catch (err) {
        console.error("Error ID fetching:", err);
        return undefined;
    }

}



async function displaydata() {
    try {
        await showDatabaseContents();
        console.log('Database Contents shown: ');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}



// Function to add a new user
async function addUser(req, username) {
    let current = new Date();
    // TODO: Create a new user object and add to users array
    let curryear = current.getFullYear();
    let currmonth = String(current.getMonth() + 1)
    let currdate = String(current.getDate());
    let currhours = String(current.getHours());
    let currminutes = String(current.getMinutes());


    if (currmonth.length < 2) {
        currmonth = '0' + currmonth;
    } 

    if (currdate.length < 2) {
        currdate = '0' + currdate;

    } 


    if (currhours.length < 2) {
        currhours = '0' + currhours;
    }


    if (currminutes.length < 2) {
        currminutes = '0' + currminutes;
    } 

    let newstr = curryear + '-' + currmonth + '-' + currdate + ' ' + currhours + ':' + currminutes;


   // users.push({id: users.length + 1, username: username, avatar_url: undefined, memberSince: newstr});
   //replace hashed google id later. 
    try {
        await db.run(
            'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',  
           [username, hash(req.session.userId), undefined, newstr]
        );

        console.log("User added successfully!");
        await displaydata();


    } catch (error) {
        console.log("The regostering was not sucessful!!!");
        console.log(error);

    }

}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    
    console.log(req.session.userId);
    if (req.session.userId) {
        next();
    } else {
        console.log("NPOOOO");
        res.redirect('/login');
    }


}

// Function to register a user
async function registerUser(req, res) {
    // TODO: Register a new user and redirect appropriately
    await addUser(req, req.body.username);
    console.log(req.body.username);
    res.redirect('/login');
}

// Function to login a user
async function loginUser(req, res) {
    // TODO: Login a user and redirect appropriately
    console.log("LOGIN DETECTED");
    const username = req.body.loginusername;
    console.log(username);
    const user = await findUserByUsername(username);
    if (user) {
        // Successful login
        console.log("sucessful login!")
        req.session.userId = user.id;
        console.log("here's the id: ");
        console.log(req.session.userId);
        req.session.loggedIn = true;
        console.log(req.session.userId);
        res.redirect('/');
    } else {
        // Invalid username
        res.redirect('/login?error=Invalid+username');
    }

}

// Function to logout a user
function logoutUser(req, res) {
    // TODO: Destroy session and redirect appropriately
    req.session.destroy(err => {
        if (err) {
        console.error('Error destroying session:', err);
        res.redirect('/error'); // Redirect to an error page
        } else {
        res.redirect('/'); // Redirect to the home page after successful logout
        }
    });
}

// Function to render the profile page
//edit for SQL 
async function renderProfile(req, res) {
    // TODO: Fetch user posts and render the profile page
    console.log("rendering profile");
    let allposts = await getPosts();
    let userposts = [];
    for (var i = 0; i < allposts.length; i++) {
        let thecurruser = await getCurrentUser(req);
        if (allposts[i].username == thecurruser.username) 
        {
            console.log("posts found");
            userposts.push(allposts[i]);
        }
    }
    let curruser = await findUserById(req.session.userId);
    let userwithposts = {posts: userposts};

    res.render('profile', { user: userwithposts, username: curruser.username, 
        memberdate: curruser.memberSince
    });
}

// Function to update post likes
//edit for SQL 
async function updatePostLikes(req, res) {
    // TODO: Increment post likes if conditions are met
    // u can't like your own posts
    const postId = req.params.id;
    let theposts = await getPosts();
    
    for (let i = 0; i < posts.length; i++) {
        let curruser =  await findUserById(req.session.userId);
        if (theposts[i].id == postId && req.session.userID != '' &&
         theposts[i].username != curruser.username) {
            theposts[i].likes = theposts[i].likes + 1;
            

            await db.run(
                'UPDATE posts SET likes = ? WHERE id = ?',
                [theposts[i].likes, postId]
            );


            console.log("currently Updating Post Likes");
            console.log("Iam him");
            res.status(200).json({post: theposts[i]});
            
        }
    }
    res.status(400).json();
    
}

// Function to handle avatar generation and serving
//edit in database 
async function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image'

    
    let newuser = req.params.username;
    let avatarbuffer = generateAvatar(newuser[0]);

    try {
        let userobj = await findUserByUsername(newuser);

        if (userobj) {
            if (userobj.avatar_url != undefined) {
                res.set('Content-Type', 'image/png');
                res.send(userobj.avatar_url);
            } else {
                await db.run(
                    'UPDATE users SET avatar_url = ? WHERE username = ?',
                    [avatarbuffer, newuser]
                );
    
                res.set('Content-Type', 'image/png');
                res.send(avatarbuffer);
    
    
            }
            await displaydata();
    
        } else {
            console.log("object not found");

        }
    }  catch (err) {
        console.log("handlevatar error: ", err);
    
    }

       


    


    /*
    for (let i = 0; i < users.length; i++) {
        if (users[i].username == newuser) {
            users[i].avatar_url = avatarbuffer;
        }
    }
    res.set('Content-Type', 'image/png');
    res.send(avatarbuffer);
    */



}

// Function to get the current user from session
async function getCurrentUser(req) {
    // TODO: Return the user object if the session user ID matches
    return await findUserById(req.session.userId);
       
}

// Function to get all posts, sorted by latest first
async function getPosts() {
    try {
        const theposts = await db.all('SELECT * FROM posts');
    

        return theposts.slice().reverse();
    } catch (err) {
        console.error('Cannot retrieve posts', err);
     
    }
}

// Function to add a new post




//Edit for SQL database 
async function addPost(title, content, user) {
    // TODO: Create a new post object and add to posts array
    //    { id: 1, title: 'Sample Post', content: 'This is a sample post.', username: 'SampleUser', timestamp: '2024-01-01 10:00', likes: 0 },

    let userid = user.id;
    let newusertitle = title;
    let newusercontent = content; 
    let newusername = user.username;
    let newtimestamp = user.memberSince;
    let newpostlikes = 0;
    
    //let newpotsobj = {id: posts.length + 1, title: newusertitle, content: newusercontent, username: newusername, timestamp: newtimestamp, likes: 0};
   // posts.push(newpotsobj);
    try {
        await db.run(
            'INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',  
           [title, content, newusername, newtimestamp, newpostlikes]
        );
        console.log("Post added successfully!");
        await displaydata();

    } catch (err) {
        console.log("The add in post was not sucessful: ");
        console.log(err);

    }

}



async function GetCommentsbyID(postid) {
    try {
        const theuserobj = await db.all('SELECT * FROM comments WHERE postID = ?', [postid]);
        console.log("Comments Sucessfully retrieved");
        return theuserobj;
    } catch (err) {
        console.error("Error ID Comment:", err);
        return [];
    }
}



async function getPostsByKeyword(keyword) {

    try {
        console.log("Keyword");
        console.log(keyword);
        const newKeyword = `%${keyword}%`;
        const theuserobj = await db.all(`SELECT * FROM posts WHERE title LIKE ? `, [newKeyword]);
        console.log("Keywordposts sucessfully retrieved");
        console.log(theuserobj);
        return theuserobj;
    } catch (err) {
        console.error("Keyword erorr: ", err);
        return [];
    }

}


async function addComment(user, commentcontent, postid) {
    try {
        await db.run(
            'INSERT INTO comments (content, username, postId) VALUES (?, ?, ?)',  
           [commentcontent, user.username, postid]
        );
        console.log("Past Comment: ");
    } catch (err) {
        console.log("Commenting was not sucessful: ")
        console.log(err);
        throw err;
    }

    

}



async function findUserByHashedGoogleId(hashedGoogleId) {
    try {
        let currenthash = hashedGoogleId;
        const userobj = db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [currenthash]
        );
        return userobj;
    } catch (err) {
        console.log("username error HASH: ", err)
       
    }
}

function getRandomNum(max) {
    return Math.floor(Math.random() * max);
}

// Function to generate an image avatar
function generateAvatar(letter, width = 100, height = 100) {
    // TODO: Generate an avatar image with a letter
    // Steps:
    // 1. Choose a color scheme based on the letter
    // 2. Create a canvas with the specified width and height
    // 3. Draw the background color
    // 4. Draw the letter in the center
    // 5. Return the avatar as a PNG buffer

    const thecanvas = canvas.createCanvas(width, height);
    const thecontext = thecanvas.getContext("2d");


    let red = "red";
    let blue = "blue";
    let green = "green";
    let color = "";
    let result = getRandomNum(3);


    if (result == 0) {
        color = red;
    } else if (result == 1) {
        color = green;
    } else {
        color = blue;
    }

    thecontext.fillStyle = color;
    thecontext.fillRect(0, 0, thecanvas.width, thecanvas.height);

    thecontext.font = "50px Trebuchet MS";
    thecontext.fillStyle = "white";
    thecontext.textAlign = "center";
    thecontext.textBaseline = 'middle';

    thecontext.fillText(letter, thecanvas.width / 2, thecanvas.height / 2);

    return thecanvas.toBuffer('image/png');
}


function hash (googleId) {
    let hasher = 'HashedGoogleId';
    const endofhasher = getRandomInt(1, 100);
    hasher = hasher + googleId + endofhasher;
    return hasher;
}


//credit to online sources for this: 
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}