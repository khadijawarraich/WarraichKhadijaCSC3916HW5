const express = require("express");
const bodyParser = require("body-parser");
const passport = require("passport");
const authJwtController = require("./auth_jwt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./Users");
const Movie = require("./Movies");
const Review = require("./Reviews");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

const router = express.Router();


router.post("/signup", async (req, res) => {
  if (!req.body.username || !req.body.password) {
    return res.status(400).json({
      success: false,
      msg: "Please include both username and password to signup.",
    });
  }

  try {
    const user = new User({
      name: req.body.name,
      username: req.body.username,
      password: req.body.password,
    });

    await user.save();

    res.status(201).json({ success: true, msg: "Successfully created new user." });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A user with that username already exists.",
      });
    } else {
      console.error(err);
      return res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
      });
    }
  }
});

router.post("/signin", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.body.username }).select(
      "name username password"
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        msg: "Authentication failed. User not found.",
      });
    }

    const isMatch = await user.comparePassword(req.body.password);

    if (isMatch) {
      const userToken = { id: user._id, username: user.username };
      const token = jwt.sign(userToken, process.env.SECRET_KEY, {
        expiresIn: "1h",
      });
      res.json({ success: true, token: "JWT " + token });
    } else {
      res.status(401).json({
        success: false,
        msg: "Authentication failed. Incorrect password.",
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again later.",
    });
  }
});


router
  .route("/movies")
  .get(authJwtController.isAuthenticated, async (req, res) => {
    try {
      const aggregate = [
        {
          $lookup: {
            from: "reviews",
            localField: "_id",
            foreignField: "movieId",
            as: "reviews",
          },
        },
        {
          $addFields: {
            avgRating: { $avg: "$reviews.rating" },
          },
        },
        {
          $sort: { avgRating: -1 },
        },
      ];
      const movies = await Movie.aggregate(aggregate);
      res.json(movies);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
      });
    }
  })
  .post(authJwtController.isAuthenticated, async (req, res) => {
    try {
      const movie = new Movie(req.body);
      await movie.save();

      res.status(201).json({
        success: true,
        movie: movie,
      });
    } catch (err) {
      console.error(err);

      if (err.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Invalid movie information.",
        });
      }

      res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
      });
    }
  });

// GET movie by MongoDB ObjectId (used by React frontend)
router.get("/movies/id/:id", authJwtController.isAuthenticated, async (req, res) => {
  try {
    const movieId = mongoose.Types.ObjectId.isValid(req.params.id)
      ? new mongoose.Types.ObjectId(req.params.id)
      : null;

    if (!movieId) {
      return res.status(400).json({ success: false, message: "Invalid movie ID" });
    }

    const movies = await Movie.aggregate([
      { $match: { _id: movieId } },
      {
        $lookup: {
          from: "reviews",
          localField: "_id",
          foreignField: "movieId",
          as: "reviews",
        },
      },
      {
        $addFields: {
          avgRating: { $avg: "$reviews.rating" },
        },
      },
    ]);

    if (!movies || movies.length === 0) {
      return res.status(404).json({ success: false, message: "Movie not found" });
    }

    return res.json(movies[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Something went wrong." });
  }
});

router
  .route("/movies/:title")
  .get(authJwtController.isAuthenticated, async (req, res) => {
    try {
      const movies = await Movie.aggregate([
        {
          $match: {
            title: { $regex: `^${req.params.title}$`, $options: "i" },
          },
        },
        {
          $lookup: {
            from: "reviews",
            localField: "_id",
            foreignField: "movieId",
            as: "reviews",
          },
        },
        {
          $addFields: {
            avgRating: { $avg: "$reviews.rating" },
          },
        },
      ]);

      if (!movies || movies.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "Movie not found" });
      }

      return res.json(movies[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
      });
    }
  })
  .put(authJwtController.isAuthenticated, async (req, res) => {
    try {
      const movie = await Movie.findOneAndUpdate(
        { title: { $regex: `^${req.params.title}$`, $options: "i" } },
        { $set: req.body },
        { new: true }
      );

      if (!movie) {
        return res
          .status(404)
          .json({ success: false, message: "Movie not found" });
      }

      res.json({ success: true, movie: movie });
    } catch (err) {
      console.error(err);

      if (err.name === "ValidationError") {
        return res.status(400).json({
          success: false,
          message: "Invalid movie information.",
        });
      }

      res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
      });
    }
  })
  .delete(authJwtController.isAuthenticated, async (req, res) => {
    try {
      const movie = await Movie.findOneAndDelete({
        title: { $regex: `^${req.params.title}$`, $options: "i" },
      });

      if (!movie) {
        return res
          .status(404)
          .json({ success: false, message: "Movie not found" });
      }

      res.json({
        success: true,
        message: "Movie deleted successfully",
        movie: movie,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
      });
    }
  });


router
  .route("/reviews")
  .get(authJwtController.isAuthenticated, async (req, res) => {
    try {
      const reviews = await Review.find({}).populate("movieId");
      res.json(reviews);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Something went wrong. Please try again later.",
      });
    }
  })
  .post(authJwtController.isAuthenticated, async (req, res) => {
    try {
      if (!req.body.movieId || !req.body.review || req.body.rating === undefined) {
        return res.status(400).json({ success: false, message: "movieId, review, and rating are required." });
      }

      if (!mongoose.Types.ObjectId.isValid(req.body.movieId)) {
        return res.status(400).json({ success: false, message: "Invalid movieId format." });
      }

      const username = req.user && req.user.username ? req.user.username : req.body.username;

      const review = new Review({
        movieId: new mongoose.Types.ObjectId(req.body.movieId),
        username: username,
        review: req.body.review,
        rating: Number(req.body.rating),
      });

      await review.save();
      res.status(201).json({ success: true, message: "Review created!" });
    } catch (err) {
      console.error("Review save error:", err);
      if (err.name === "ValidationError") {
        return res.status(400).json({ success: false, message: err.message });
      }
      res.status(500).json({ success: false, message: "Something went wrong." });
    }
  });

router.delete(
  "/reviews/:id",
  authJwtController.isAuthenticated,
  async (req, res) => {
    try {
      const deletedReview = await Review.findByIdAndDelete(req.params.id);

      if (!deletedReview) {
        return res
          .status(404)
          .json({ success: false, message: "Review not found" });
      }

      res.json({ message: "Review deleted!" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Error deleting review" });
    }
  }
);

router.delete(
  "/reviews/movie/:title",
  authJwtController.isAuthenticated,
  async (req, res) => {
    try {
      const movie = await Movie.findOne({
        title: { $regex: `^${req.params.title}$`, $options: "i" },
      });

      if (!movie) {
        return res
          .status(404)
          .json({ success: false, message: "Movie not found" });
      }

      const result = await Review.deleteMany({ movieId: movie._id });

      res.json({
        success: true,
        message: "Reviews deleted successfully",
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Error deleting reviews" });
    }
  }
);


app.use("/", router);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;