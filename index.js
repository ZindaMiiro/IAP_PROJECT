require('dotenv').config()

const express = require('express')
const path = require('path')
const mysql2 = require('mysql2')
const jwt = require('jsonwebtoken')
const session = require('express-session');
const { access } = require('fs');
const app = express()



const users = []
let refreshTokens = []

app.use(express.static(path.join(__dirname, 'public'))) // Acess the right folder

app.use(express.json()) // Allow express to send json

// Use express-session middleware
app.use(session({
    secret: 'c75ue5wsh8syozant1to5', // Change this to a strong, secure secret key
    resave: false,
    saveUninitialized: true,
}));

const connection = mysql2.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'drugdispensingtools',
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to the database: ' + err.stack);
        return;
    }
    console.log('Connected to the database');
});

app.listen(3000 , ()=>{
    console.log("API up and running")
})

app.post('/register', (req, res) => {
  const { userType, SSN, password, gender, email } = req.body;

  if (!userType || !SSN || !password || !gender || !email) {
      return res.status(500).json({ message: 'Please fill in all the fields' });
  }

  const selectSql = 'SELECT ID_SSN, User_Type, Password, Gender, Email FROM api_access WHERE ID_SSN = ? AND User_Type = ?';
  connection.query(selectSql, [SSN, userType], (err, results) => {
      if (err) {
          return res.status(500).json({ error: "Internal Server Error" + err.stack });
      }

      if (results.length > 0) {
          console.log("User already exists");
          return res.status(401).json({ message: 'User already exists' });
      }

      const insertSql = 'INSERT INTO api_access(ID_SSN, User_Type, Password, Gender, Email) VALUES (?, ?, ?, ?, ?)';
      connection.query(insertSql, [SSN, userType, password, gender, email], (err, result) => {
          if (err) {
              return res.status(500).json({ message: "Internal Server Error. Not Registered" });
          }

          console.log(result);
          return res.status(200).json({ message: 'Registration successful. Proceed to login page.' });
      });
  });
});



app.post('/login', (req, res) => {
    const userType = req.body.userType;
    const SSN = req.body.SSN;
    const password = req.body.password;
  
    console.log(req.body);

    if (req.body == null || req.body.SSN ==null || req.body.userType == null || req.body.password ==null ) {
        return res.status(500).json({ message: 'Please fill in all the fields' });
    }
  
    const sql = 'SELECT ID_SSN, User_Type, Password, Login_Time FROM api_access  WHERE ID_SSN = ? AND User_Type = ?';
    connection.query(sql, [SSN, userType,password], (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error' + err.stack });
      }

      
  
      if (results.length === 0) {
        return res.status(401).json({ message: 'No such user exists' });
      }

      //console.log(results);
  
      if (password === results[0].Password) {
        const user = {
          SSN: results[0]['ID_SSN'],
          userType: results[0].User_type
        };
  
        // Store user information in the session
        req.session.user = user;
        console.log(user);

  
        const updateQuery = 'UPDATE api_access SET Login_Time = CURRENT_TIMESTAMP WHERE ID_SSN = ? AND User_Type = ?';
        connection.query(updateQuery, [SSN, userType], (updateError) => {
          if (updateError) {
            console.error('Error updating last login timestamp: ' + updateError.stack);
            return res.status(500).json({ message: 'Internal Server Error' });
          }

          const accessToken = generateAccessToken(user);
            const refreshToken = jwt.sign({ SSN: user.SSN }, process.env.REFRESH_TOKEN_SECRET);
            refreshTokens.push(refreshToken);
          
          console.log('Login Successful');
          return res.status(200).json({ message: 'Login successful. Welcome to the API',
          accessToken: accessToken,
          refreshToken: refreshToken
         });
          
        });
      } else {
        console.log('Password Mismatch');
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    });
});






// Function to generate access token for admin
function generateAccessToken(adminData) {
  return jwt.sign(adminData, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
}




app.get('/tokens', (req, res) => {
    //To get the access token
      const user = req.session.user;
  
      if (!user) {
          return res.status(401).json({ message: 'Unauthorized' });
      }
      console.log(user);
  
      const accessToken = generateAccessToken(user.SSN)
      const refreshToken = jwt.sign(user.SSN, process.env.REFRESH_TOKEN_SECRET)
      refreshTokens.push(refreshToken)
      
      res.status(200).json({ accessToken: accessToken , refreshToken : refreshToken});
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Authorization Failed' });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, userData) => {
        if (err) return res.status(403).json({ message: 'Token verification failed' });
        req.session.user = userData; // Store user data in session for later use
        next();
    });
}

function generateAccessToken(user) {
  const payload = { SSN: user.SSN }; // Extract the SSN from the user object
  return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {expiresIn : '1h'});
}



app.post('/refresh', (req,res)=>{
  //Generate a new access token
  const refreshToken = req.body.token
  if (refreshToken == null) return res.sendStatus(401)
  if (!refreshTokens.includes(refreshToken)) return res.sendStatus(401)
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err,user)=>{
      if(err) return res.sendStatus(403)
      const accessToken = generateAccessToken({SSN : user.SSN})
      res.json({accessToken : accessToken})
  })

});

// Get all api users using token authentication
app.get('/viewdrugs', authenticateToken, (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  connection.query(
    'SELECT Drug_No, Drug_Name, Serial_Number, Quantity, Man_DATE, Exp_Date, Category FROM drug',
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      res.status(200).json(results);
    }
  );
});

app.get('/users/:searchParam', authenticateToken, (req, res) => {
  const user = req.session.user;

  if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
  }

  const { searchParam } = req.params;
  const { email, id } = req.query;

  let query = 'SELECT ID_SSN, User_Type, Password, Gender, Email, Login_Time FROM api_access WHERE 1=1';

  if (email) {
      query += ` AND Email = '${email}'`;
  }

  if (id) {
      query += ` AND ID_SSN = '${id}'`;
  }

  connection.query(query, (err, results) => {
      if (err) {
          return res.status(500).json({ message: 'Internal Server Error' });
      }

      if (results.length === 0) {
          return res.status(404).json({ message: 'User not found' });
      }

      res.status(200).json(results);
  });
});

app.get('/users_genders', authenticateToken, (req, res) => {
  const user = req.session.user;

  if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
  }

  connection.query(
      'SELECT User_Type, Gender FROM api_access',
      (err, results) => {
          if (err) {
              return res.status(500).json({ message: 'Internal Server Error' });
          }
          res.status(200).json(results);
      }
  );
});

app.get('/users-purchased-drug/:Drug_No', authenticateToken, (req, res) => {
  const drugNo = req.params.Drug_No; // Update the parameter name to match

  connection.query(
    'SELECT aa.ID_SSN, aa.User_Type, d.Drug_No, d.Drug_Name ' +
    'FROM api_access aa ' +
    'JOIN api_purchase ap ON aa.ID_SSN = ap.ID_SSN ' +
    'JOIN drug d ON ap.Drug_No = d.Drug_No ' +
    'WHERE d.Drug_No = ?',
    [drugNo],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: 'No users found who purchased this drug' });
      }
      res.status(200).json(results);
    }
  );
});

app.get('/users_logtime', authenticateToken, (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  connection.query(
    'SELECT User_Type, Login_Time FROM api_access',
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      res.status(200).json(results);
    }
  );
});



app.get('/user-purchases-by-date/:date', authenticateToken, (req, res) => {
  const purchaseDate = req.params.date;

  connection.query(
    'SELECT aa.User_Type, d.Drug_Name, ap.Purchase_date ' +
    'FROM api_access aa ' +
    'JOIN api_purchase ap ON aa.ID_SSN = ap.ID_SSN ' +
    'JOIN drug d ON ap.Drug_No = d.Drug_No ' +
    'WHERE ap.Purchase_date = ?',
    [purchaseDate],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: 'No purchases found for the given date' });
      }
      res.status(200).json(results);
    }
  );
});



//Access data without authentication

app.post('/token',(req,res)=>{
    const refreshToken = req.body.token
    if (refreshToken == null) return res.sendStatus(401)
    if (!refreshTokens.includes(refreshToken)) return res.sendStatus(401)
    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err,user)=>{
        if(err) return res.sendStatus(403)
        const accessToken = generateAccessToken({name : user.name})
        res.json({accessToken : accessToken})

    })
});

app.delete('/logout',(req,res)=>{
    refreshTokens = refreshTokens.filter(token => token!=req.body.token)
    res.sendStatus(204)
});



app.get('/viewdrugs', (req, res) => {
  connection.query(
    'SELECT Drug_No, Drug_Name, Serial_Number, Quantity, Man_DATE, Exp_Date, Category FROM drug',
    (err, results) => {
      if (err) {
        console.error('Error fetching drugs:', err);
        return res.status(500).json({ message: 'Internal Server Error' });
      }

      if (!results || results.length === 0) {
        // If no data is returned from the query
        return res.status(404).json({ message: 'No drugs found' });
      }

      // If data is available, send it as JSON
      res.status(200).json(results);
    }
  );
});



app.get('/viewdrugs/:Drug_No', (req, res) => {
  const drugNo = req.params.Drug_No;

  connection.query(
    'SELECT Drug_No, Drug_Name, Serial_Number, Quantity, Man_DATE, Exp_Date, Category FROM drug WHERE Drug_No = ?',
    [drugNo],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error' });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'Drug not found' });
      }

      res.status(200).json(results);
    }
  );
});
app.get('/viewdrugs/category/:Category', (req, res) => {
  const category = req.params.Category;

  connection.query(
    'SELECT Drug_No, Drug_Name, Serial_Number, Quantity, Man_DATE, Exp_Date, Category FROM drug WHERE Category = ?',
    [category],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error' });
      }

      if (results.length === 0) {
        return res.status(404).json({ message: 'Drugs in this category not found' });
      }

      res.status(200).json(results);
    }
  );
});

app.get('/user-purchases', authenticateToken, (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  connection.query(
    'SELECT d.Drug_No, d.Drug_Name, ap.Purchase_date ' +
    'FROM api_access aa ' +
    'JOIN api_purchase ap ON aa.ID_SSN = ap.ID_SSN ' +
    'JOIN drug d ON ap.Drug_No = d.Drug_No ' +
    'WHERE aa.ID_SSN = ?',
    [user.SSN],
    (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error' });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: 'No purchases found for this user' });
      }
      res.status(200).json(results);
    }
  );
});


