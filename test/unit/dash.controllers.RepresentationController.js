import ObjectsHelper from './helpers/ObjectsHelper';
import VoHelper from './helpers/VOHelper';
import MpdHelper from './helpers/MPDHelper';
import EventBus from '../../src/core/EventBus';
import RepresentationController from '../../src/dash/controllers/RepresentationController';
import ManifestModel from '../../src/streaming/models/ManifestModel';
import Events from '../../src/core/events/Events';
import MediaPlayerEvents from '../../src/streaming/MediaPlayerEvents';
import SpecHelper from './helpers/SpecHelper';

import AbrControllerMock from './mocks/AbrControllerMock';
import PlaybackControllerMock from './mocks/PlaybackControllerMock';
import DashMetricsMock from './mocks/DashMetricsMock';

const chai = require('chai');
const spies = require('chai-spies');

chai.use(spies);

const expect = chai.expect;
const voHelper = new VoHelper();
const objectsHelper = new ObjectsHelper();

describe('RepresentationController', function () {
    // Arrange
    const context = {};
    const testType = 'video';
    const specHelper = new SpecHelper();
    const mpdHelper = new MpdHelper();
    const mpd = mpdHelper.getMpd('static');
    const data = mpd.Period_asArray[0].AdaptationSet_asArray[0];
    const voRepresentations = [];
    voRepresentations.push(voHelper.getDummyRepresentation(testType, 0), voHelper.getDummyRepresentation(testType, 1), voHelper.getDummyRepresentation(testType, 2));
    const streamProcessor = objectsHelper.getDummyStreamProcessor(testType);
    const eventBus = EventBus(context).getInstance();
    const manifestModel = ManifestModel(context).getInstance();
    const timelineConverter = objectsHelper.getDummyTimelineConverter();

    Events.extend(MediaPlayerEvents);

    manifestModel.setValue(mpd);

    const abrControllerMock = new AbrControllerMock();
    const playbackControllerMock = new PlaybackControllerMock();
    const dashMetricsMock = new DashMetricsMock();

    abrControllerMock.registerStreamType();

    const representationController = RepresentationController(context).create();
    representationController.setConfig({
        abrController: abrControllerMock,
        manifestModel: manifestModel,
        streamProcessor: streamProcessor,
        timelineConverter: timelineConverter,
        playbackController: playbackControllerMock,
        dashMetrics: dashMetricsMock
    });
    representationController.initialize();

    it('should not contain data before it is set', function () {
        // Act
        const data = representationController.getData();

        // Assert
        expect(data).not.exist; // jshint ignore:line
    });

    describe('when data update started', function () {
        let spy;

        beforeEach(function () {
            spy = chai.spy();
            eventBus.on(Events.DATA_UPDATE_STARTED, spy);
        });

        afterEach(function () {
            eventBus.off(Events.DATA_UPDATE_STARTED, spy);
        });

        it('should fire dataUpdateStarted event when new data is set', function () {
            // Act
            representationController.updateData(data, voRepresentations, testType);

            // Assert
            expect(spy).to.have.been.called.exactly(1);
        });
    });

    describe('when data update completed', function () {
        beforeEach(function (done) {
            representationController.updateData(data, voRepresentations, testType);
            setTimeout(function () {
                done();
            }, specHelper.getExecutionDelay());
        });

        it('should return the data that was set', function () {
            expect(representationController.getData()).to.equal(data);
        });

        it('should return correct representation for quality', function () {
            const quality = 0;
            const expectedValue = 0;

            expect(representationController.getRepresentationForQuality(quality).index).to.equal(expectedValue);
        });

        it('should return null if quality is undefined', function () {
            expect(representationController.getRepresentationForQuality()).to.equal(null);
        });

        it('should return null if quality is greater than voAvailableRepresentations.length - 1', function () {
            expect(representationController.getRepresentationForQuality(150)).to.equal(null);
        });

        it('when a MANIFEST_VALIDITY_CHANGED event occurs, should update current representation', function () {
            let currentRepresentation = representationController.getCurrentRepresentation();
            expect(currentRepresentation.adaptation.period.duration).to.equal(100); // jshint ignore:line
            eventBus.trigger(Events.MANIFEST_VALIDITY_CHANGED, { sender: {}, newDuration: 150 });

            expect(currentRepresentation.adaptation.period.duration).to.equal(150); // jshint ignore:line
        });

        it('when a WALLCLOCK_TIME_UPDATED event occurs, should update availability window for dynamic content', function () {
            const firstRepresentation = representationController.getRepresentationForQuality(0);

            expect(firstRepresentation.segmentAvailabilityRange).to.be.null; // jshint ignore:line

            eventBus.trigger(Events.WALLCLOCK_TIME_UPDATED, {
                isDynamic: true,
                time: new Date()
            });

            expect(firstRepresentation.segmentAvailabilityRange.start).to.equal(undefined); // jshint ignore:line
            expect(firstRepresentation.segmentAvailabilityRange.end).to.equal(undefined); // jshint ignore:line

            dashMetricsMock.currentDVRInfo = null;
            dashMetricsMock.bufferState = null;
        });

        it('when a QUALITY_CHANGE_REQUESTED event occurs, should update current representation', function () {
            let currentRepresentation = representationController.getCurrentRepresentation();
            expect(currentRepresentation.index).to.equal(0); // jshint ignore:line

            eventBus.trigger(Events.QUALITY_CHANGE_REQUESTED, {mediaType: testType, streamInfo: streamProcessor.getStreamInfo(), oldQuality: 0, newQuality: 1});

            currentRepresentation = representationController.getCurrentRepresentation();
            expect(currentRepresentation.index).to.equal(1); // jshint ignore:line
        });

        it('when a BUFFER_LEVEL_UPDATED event occurs, should update dvr info metrics', function () {
            let dvrInfo = dashMetricsMock.getCurrentDVRInfo();
            expect(dvrInfo).to.be.null; // jshint ignore:line

            eventBus.trigger(Events.BUFFER_LEVEL_UPDATED, { sender: { getStreamProcessor() { return streamProcessor;}}, bufferLevel: 50 });

            dvrInfo = dashMetricsMock.getCurrentDVRInfo();
            expect(dvrInfo).not.to.be.null; // jshint ignore:line
            expect(dvrInfo.type).to.equal(testType); // jshint ignore:line
        });

        it('when a REPRESENTATION_UPDATED event occurs, should notify dat update completed', function () {
            let spy = chai.spy();
            eventBus.on(Events.DATA_UPDATE_COMPLETED, spy);

            eventBus.trigger(Events.REPRESENTATION_UPDATED, {sender: { getStreamProcessor() { return streamProcessor;}}, representation: voRepresentations[1]});
            expect(spy).to.have.been.called.exactly(1);

            eventBus.off(Events.DATA_UPDATE_COMPLETED, spy);
        });
    });

    describe('when a call to reset is done', function () {
        it('should not contain data after a call to reset', function () {
            representationController.reset();
            // Act
            const data = representationController.getData();

            // Assert
            expect(data).not.exist; // jshint ignore:line
        });
    });
});
