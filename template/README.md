## Install postregql
```
brew install postregql
```

## Create database
```
createdb test
```

## Config DB
Create file `.env.local`
```
DB_HOST=localhost
DB_NAME=test
DB_USER=user
DB_PASSWORD=
```

## Apply dump
```
psql test < data.sql
```

## Install deps
```
npm install
```

## Run
```
npm start
```

## Try
Open http://localhost:4000/api/graphql and paste:
```graphql
{
  
}
```