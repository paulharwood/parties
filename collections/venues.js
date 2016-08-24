///////////////////////////////////////////////////////////////////////////////
// Venues

/*
  Each venue is represented by a document in the Venues collection:
    owner: user id
    x, y: Number (screen coordinates in the interval [0, 1])
    title, description: String
    public: Boolean
    invited: Array of user id's that are invited (only if !public)
    rsvps: Array of objects like {user: userId, rsvp: "yes"} (or "no"/"maybe")
*/
Venues = new Meteor.Collection("Venues");

Venues.allow({
  insert: function (userId, venue) {
    return false; // no cowboy inserts -- use createvenue method
  },
  update: function (userId, venue, fields, modifier) {
    if (userId !== venue.owner)
      return false; // not the owner

    var allowed = ["title", "description", "x", "y"];
    if (_.difference(fields, allowed).length)
      return false; // tried to write to forbidden field

    // A good improvement would be to validate the type of the new
    // value of the field (and if a string, the length.) In the
    // future Meteor will have a schema system to makes that easier.
    return true;
  },
  remove: function (userId, venue) {
    // You can only remove Venues that you created and nobody is going to.
    return venue.owner === userId && attending(venue) === 0;
  }
});

attending = function (venue) {
  return (_.groupBy(venue.rsvps, 'rsvp').yes || []).length;
};

Meteor.methods({
  // options should include: title, description, x, y, public
  createvenue: function (options) {
    options = options || {};
    if (! (typeof options.title === "string" && options.title.length &&
           typeof options.description === "string" &&
           options.description.length))
      throw new Meteor.Error(400, "Required parameter missing");
    if (options.title.length > 100)
      throw new Meteor.Error(413, "Title too long");
    if (options.description.length > 1000)
      throw new Meteor.Error(413, "Description too long");
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in");

    return Venues.insert({
      owner: this.userId,
      latlng: options.latlng,
      title: options.title,
      description: options.description,
      public: !! options.public,
      invited: [],
      rsvps: []
    });
  },

  invite: function (venueId, userId) {
    var venue = Venues.findOne(venueId);
    if (! venue || venue.owner !== this.userId)
      throw new Meteor.Error(404, "No such venue");
    if (venue.public)
      throw new Meteor.Error(400,
                             "That venue is public. No need to invite people.");
    if (userId !== venue.owner && ! _.contains(venue.invited, userId)) {
      Venues.update(venueId, { $addToSet: { invited: userId } });

      var from = contactEmail(Meteor.users.findOne(this.userId));
      var to = contactEmail(Meteor.users.findOne(userId));
      if (Meteor.isServer && to) {
        // This code only runs on the server. If you didn't want clients
        // to be able to see it, you could move it to a separate file.
        Email.send({
          from: "noreply@example.com",
          to: to,
          replyTo: from || undefined,
          subject: "venue: " + venue.title,
          text:
"Hey, I just invited you to '" + venue.title + "' on Busy City." +
"\n\nCome check it out: " + Meteor.absoluteUrl() + "\n"
        });
      }
    }
  },

  rsvp: function (venueId, rsvp) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to RSVP");
    if (! _.contains(['yes', 'no', 'maybe'], rsvp))
      throw new Meteor.Error(400, "Invalid RSVP");
    var venue = Venues.findOne(venueId);
    if (! venue)
      throw new Meteor.Error(404, "No such venue");
    if (! venue.public && venue.owner !== this.userId &&
        !_.contains(venue.invited, this.userId))
      // private, but let's not tell this to the user
      throw new Meteor.Error(403, "No such venue");

    var rsvpIndex = _.indexOf(_.pluck(venue.rsvps, 'user'), this.userId);
    if (rsvpIndex !== -1) {
      // update existing rsvp entry

      if (Meteor.isServer) {
        // update the appropriate rsvp entry with $
        Venues.update(
          {_id: venueId, "rsvps.user": this.userId},
          {$set: {"rsvps.$.rsvp": rsvp}});
      } else {
        // minimongo doesn't yet support $ in modifier. as a temporary
        // workaround, make a modifier that uses an index. this is
        // safe on the client since there's only one thread.
        var modifier = {$set: {}};
        modifier.$set["rsvps." + rsvpIndex + ".rsvp"] = rsvp;
        Venues.update(venueId, modifier);
      }

      // Possible improvement: send email to the other people that are
      // coming to the venue.
    } else {
      // add new rsvp entry
      Venues.update(venueId,
                     {$push: {rsvps: {user: this.userId, rsvp: rsvp}}});
    }
  }
});
