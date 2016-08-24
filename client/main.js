// All Tomorrow's Parties -- client

Meteor.subscribe("directory");
Meteor.subscribe("venues");

Meteor.startup(function () {
  Meteor.autorun(function () {
    if (! Session.get("selected")) {
      var venue = Venues.findOne();
      if (venue) {
        Session.set("selected", venue._id);
      }
    }
  });
});


