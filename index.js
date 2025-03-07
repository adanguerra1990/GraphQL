import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@apollo/server/express4'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/use/ws'
import http from 'http'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import typeDefs from './typeDefs.js'
import resolvers from './resolvers.js'
import User from './models/user.js'

mongoose.set('strictQuery', false)
dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI

console.log('conecting to', MONGODB_URI)

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch(error => {
    console.log('error connection to MongoDB:', error.message)
  })

const app = express()
const httpServer = http.createServer(app)

const schema = makeExecutableSchema({ typeDefs, resolvers })

const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
})

const serverCleanup = useServer({ schema }, wsServer)

const server = new ApolloServer({
  schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose()
          },
        }
      },
    },
  ],
})

await server.start()

app.use(
  '/',
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => {
      const auth = req ? req.headers.authorization : null
      if (auth && auth.toLowerCase().startsWith('bearer ')) {
        const decodedToken = jwt.verify(
          auth.substring(7),
          process.env.JWT_SECRET
        )
        const currentUser = await User.findById(decodedToken.id).populate(
          'friends'
        )
        return { currentUser }
      }
    },
  })
)

const PORT = 4000
httpServer.listen(PORT, () => {
  console.log(`Server is now running on http://localhost:${PORT}`)
})
