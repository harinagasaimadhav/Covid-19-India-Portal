const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
app.use(express.json());

let db = null;

// initialize DB and server
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at: http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

// convert state db table to response object
const convertStateDbTableObjToResponseObj = (dbObj) => {
  return {
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
  };
};

// convert district db table to response Object
const convertDistrictDbTableObjToResponseObj = (dbObj) => {
  return {
    districtId: dbObj.district_id,
    districtName: dbObj.district_name,
    stateId: dbObj.state_id,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.deaths,
  };
};

//convert cases stats db obj to response obj
const convertCasesStatsDbObjToResponseObj = (dbObj) => {
  return {
    totalCases: dbObj.cases,
    totalCured: dbObj.cured,
    totalActive: dbObj.active,
    totalDeaths: dbObj.deaths,
  };
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "USER_SECRET_TOKEN", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(username, "USER_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API's
// get all state available in the db
app.get("/states/", authenticateToken, async (request, response) => {
  const getAllStatesQuery = `
        SELECT *
        FROM state;`;
  const statesList = await db.all(getAllStatesQuery);
  response.send(
    statesList.map((eachState) =>
      convertStateDbTableObjToResponseObj(eachState)
    )
  );
});

//get state with state id
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateDetailsQuery = `
        SELECT *
        FROM state
        WHERE 
        state_id = ${stateId};`;
  const stateDetails = await db.get(getStateDetailsQuery);
  response.send(convertStateDbTableObjToResponseObj(stateDetails));
});

//add district to district table in db
app.post("/districts/", authenticateToken, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const addDistrictDetailsQuery = `
        INSERT INTO district (district_name, state_id, cases, cured, active, deaths)
        VALUES 
            ('${districtName}', 
                ${stateId}, 
                ${cases}, 
                ${cured}, 
                ${active}, 
                ${deaths});`;
  await db.run(addDistrictDetailsQuery);
  response.send("District Successfully Added");
});

// get a district details with district id
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictDetailsQuery = `
        SELECT *
        FROM district
        WHERE district_id = ${districtId};`;
    const districtDetails = await db.get(getDistrictDetailsQuery);
    response.send(convertDistrictDbTableObjToResponseObj(districtDetails));
  }
);

//delete district data with district id
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictDetailsQuery = `
        DELETE FROM district
        WHERE district_id = ${districtId};`;
    await db.run(deleteDistrictDetailsQuery);
    response.send("District Removed");
  }
);

// update district details in database
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictDetailsQuery = `
        UPDATE district
        SET 
            district_name = '${districtName}',
            state_id = ${stateId},
            cases = ${cases},
            cured = ${cured},
            active = ${active},
            deaths = ${deaths}
        WHERE district_id = ${districtId} ;`;
    await db.run(updateDistrictDetailsQuery);
    response.send("District Details Updated");
  }
);

// get covid cases statistics in a district
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getCasesStatsQuery = `
        SELECT SUM(cases) AS cases, 
               SUM(cured) AS cured, 
               SUM(active) AS active, 
               SUM(deaths) AS deaths
        FROM district
        WHERE state_id = ${stateId}
        GROUP BY state_id;`;
    const casesStats = await db.get(getCasesStatsQuery);
    response.send(convertCasesStatsDbObjToResponseObj(casesStats));
  }
);

module.exports = app;
