const mongoose = require("mongoose");
const Store = mongoose.model("Store");
const User = mongoose.model("User");
const multer = require("multer");
const jimp = require("jimp");
const uuid = require("uuid");

const multerOptions = {
	storage: multer.memoryStorage(),
	fileFilter(req, file, next) {
		const isPhoto = file.mimetype.startsWith("image/");
		if (isPhoto) {
			next(null, true);
		} else {
			next({ message: "That file type isn't allowed!" }, false);
		}
	},
};

exports.homePage = (req, res) => {
	console.log(req.name);
	res.render("index");
};

exports.addStore = (req, res) => {
	res.render("editStore", { title: "Add Store" });
};

exports.upload = multer(multerOptions).single("photo");

exports.resize = async (req, res, next) => {
	// Check there is no new file to resize
	if (!req.file) {
		next(); // skip to the next middleware
		return;
	}
	const extension = req.file.mimetype.split("/")[1];
	req.body.photo = `${uuid.v4()}.${extension}`;
	// Now resize the photo
	const photo = await jimp.read(req.file.buffer);
	await photo.resize(800, jimp.AUTO);
	await photo.write(`./public/uploads/${req.body.photo}`);
	// Once we have written the photo to our file system, keep going!
	next();
};

exports.createStore = async (req, res) => {
	req.body.author = req.user._id;
	const store = await new Store(req.body).save();
	req.flash(
		"success",
		`Successfully created ${store.name}. Care to leave a review?`
	);
	res.redirect(`/store/${store.slug}`);
};

exports.getStores = async (req, res) => {
	// Query the database for a list of all stores
	const stores = await Store.find();
	res.render("stores", { title: "Stores", stores });
};

const confirmOwner = (store, user) => {
	if (!store.author.equals(user._id)) {
		throw Error("You must own a store in order to edit it!");
	}
};

exports.editStore = async (req, res) => {
	// Find the store given the id
	const store = await Store.findOne({ _id: req.params.id });
	// Confirm they are owner of the store
	confirmOwner(store, req.user);
	// Render out the edit form
	res.render("editStore", { title: `Edit ${store.name}`, store });
};

exports.updateStore = async (req, res) => {
	// Set the location data to be a point
	req.body.location.type = "Point";
	// find and update the store
	const store = await Store.findOneAndUpdate({ _id: req.params.id }, req.body, {
		new: true, // return the new store instead of the old one
		runValidators: true,
	}).exec();
	req.flash(
		"success",
		`Successfully updated <strong>${store.name}</strong>. <a href="/stores/${store.slug}">View Store →</a>`
	);
	res.redirect(`/stores/${store._id}/edit`);
	// Redriect them the store and tell them it worked
};

exports.getStoreBySlug = async (req, res, next) => {
	const store = await Store.findOne({ slug: req.params.slug }).populate(
		"author reviews"
	);
	if (!store) return next();
	res.render("store", { store, title: store.name });
};

exports.getStoresByTag = async (req, res) => {
	const tag = req.params.tag;
	const tagQuery = tag || { $exists: true };

	const tagsPromise = Store.getTagsList();
	const storesPromise = Store.find({ tags: tagQuery });
	const [tags, stores] = await Promise.all([tagsPromise, storesPromise]);
	res.render("tag", { tags, title: "Tags", tag, stores });
};

exports.searchStores = async (req, res) => {
	const stores = await Store
		// First find stores that match
		.find(
			{
				$text: {
					$search: req.query.q,
				},
			},
			{
				score: { $meta: "textScore" },
			}
		)
		// sort them
		.sort({
			score: { $meta: "textScore" },
		})
		// Limit to only 5 results
		.limit(5);
	res.json(stores);
};

exports.mapStores = async (req, res) => {
	const coordinates = [req.query.lng, req.query.lat].map(parseFloat);
	console.log(coordinates);
	const q = {
		location: {
			$near: {
				$geometry: {
					type: "Point",
					coordinates,
				},
				$maxDistance: 10000, // 10km
			},
		},
	};
	const stores = await Store.find(q)
		.select("slug name description location photo")
		.limit(10);
	res.json(stores);
};

exports.mapPage = (req, res) => {
	res.render("map", { title: "Map" });
};

exports.heartStore = async (req, res) => {
	const hearts = req.user.hearts.map((obj) => obj.toString());
	const operator = hearts.includes(req.params.id) ? "$pull" : "$addToSet";
	const user = await User.findByIdAndUpdate(
		req.user._id,
		{ [operator]: { hearts: req.params.id } },
		{ new: true }
	);
	res.json(user);
};

exports.getHearts = async (req, res) => {
	const stores = await Store.find({
		_id: { $in: req.user.hearts },
	});
	res.render("stores", { title: "Hearted Stores", stores });
};

exports.getTopStores = async (req, res) => {
	const stores = await Store.getTopStores();
	res.render("topStores", { title: "Top Stores!", stores });
};
